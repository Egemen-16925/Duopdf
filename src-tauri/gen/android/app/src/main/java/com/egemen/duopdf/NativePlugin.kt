package com.egemen.duopdf

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.WebView
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import java.util.Locale
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class PickArgs {
  var mimeTypes: Array<String>? = null
  var multiple: Boolean = false
}

@InvokeArg
class CreateArgs {
  lateinit var name: String
  lateinit var mimeType: String
}

@InvokeArg
class UriArgs {
  lateinit var uri: String
}

@InvokeArg
class SecretArgs {
  lateinit var data: String
}

@InvokeArg
class SpeakArgs {
  lateinit var text: String
  var rate: Float = 1f
}

/**
 * Duopdf'un Android'e özel işleri:
 * - Belge seçme (ACTION_OPEN_DOCUMENT) ve kalıcı okuma izni: belge uygulama yeniden açılınca da okunabilsin.
 * - Kaydetme yeri seçme (ACTION_CREATE_DOCUMENT): yedek ve çizimli PDF.
 * - API anahtarlarını Android Keystore'daki, cihazdan çıkarılamayan bir AES anahtarıyla şifreleme.
 * - Sesli okuma: WebView'da Web Speech API olmadığı için Android'in TextToSpeech motoru.
 * Dosyaların içeriği burada okunmaz; Rust tarafı fs eklentisiyle doğrudan okur/yazar.
 */
@TauriPlugin
class NativePlugin(private val activity: Activity) : Plugin(activity) {
  private var tts: TextToSpeech? = null
  /** null: motor henüz hazırlanıyor. */
  private var ttsReady: Boolean? = null
  private val waitingForTts = mutableListOf<Invoke>()
  /** Okunan cümle bitince (ya da durdurulunca) yanıtlanacak istekler. */
  private val speaking = HashMap<String, Invoke>()

  override fun load(webView: WebView) {
    super.load(webView)
    tts = TextToSpeech(activity) { status ->
      val engine = tts
      val ok = status == TextToSpeech.SUCCESS && engine != null && engine.isLanguageAvailable(Locale.US) >= TextToSpeech.LANG_AVAILABLE
      if (ok) {
        engine!!.language = Locale.US
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String?) {}
          override fun onDone(utteranceId: String?) = finishSpeaking(utteranceId)
          @Deprecated("Deprecated in Java")
          override fun onError(utteranceId: String?) = finishSpeaking(utteranceId)
          override fun onStop(utteranceId: String?, interrupted: Boolean) = finishSpeaking(utteranceId)
        })
      }
      val waiting = synchronized(waitingForTts) {
        ttsReady = ok
        waitingForTts.toList().also { waitingForTts.clear() }
      }
      waiting.forEach { resolveAvailability(it, ok) }
    }
  }

  override fun onDestroy() {
    tts?.shutdown()
    super.onDestroy()
  }

  private fun resolveAvailability(invoke: Invoke, ok: Boolean) {
    val res = JSObject()
    res.put("available", ok)
    invoke.resolve(res)
  }

  private fun finishSpeaking(id: String?) {
    val invoke = synchronized(speaking) { speaking.remove(id) }
    invoke?.resolve()
  }

  @Command
  fun speechAvailable(invoke: Invoke) {
    val ready = synchronized(waitingForTts) {
      ttsReady.also { if (it == null) waitingForTts.add(invoke) }
    }
    if (ready != null) resolveAvailability(invoke, ready)
  }

  /** İngilizce metni okur; okuma bitince ya da durdurulunca yanıt verir. */
  @Command
  fun speak(invoke: Invoke) {
    val args = invoke.parseArgs(SpeakArgs::class.java)
    val engine = tts
    if (ttsReady != true || engine == null) {
      invoke.reject("Ses motoru hazır değil.")
      return
    }
    val id = UUID.randomUUID().toString()
    synchronized(speaking) { speaking[id] = invoke }
    engine.setSpeechRate(args.rate)
    if (engine.speak(args.text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) finishSpeaking(id)
  }

  @Command
  fun stopSpeaking(invoke: Invoke) {
    tts?.stop()
    val pending = synchronized(speaking) { speaking.values.toList().also { speaking.clear() } }
    pending.forEach { it.resolve() }
    invoke.resolve()
  }

  @Command
  fun pickDocuments(invoke: Invoke) {
    val args = invoke.parseArgs(PickArgs::class.java)
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      args.mimeTypes?.takeIf { it.isNotEmpty() }?.let { putExtra(Intent.EXTRA_MIME_TYPES, it) }
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, args.multiple)
    }
    startActivityForResult(invoke, intent, "pickResult")
  }

  @ActivityCallback
  fun pickResult(invoke: Invoke, result: ActivityResult) {
    val files = JSArray()
    val data = result.data
    if (result.resultCode == Activity.RESULT_OK && data != null) {
      val uris = mutableListOf<Uri>()
      val clip = data.clipData
      if (clip != null) {
        for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
      } else {
        data.data?.let { uris.add(it) }
      }
      for (uri in uris) {
        try {
          activity.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: SecurityException) {
          // Bazı sağlayıcılar kalıcı izin vermez; belge bu oturumda yine açılır.
        }
        val file = JSObject()
        file.put("uri", uri.toString())
        file.put("name", displayName(uri))
        files.put(file)
      }
    }
    val res = JSObject()
    res.put("files", files)
    invoke.resolve(res)
  }

  @Command
  fun createDocument(invoke: Invoke) {
    val args = invoke.parseArgs(CreateArgs::class.java)
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = args.mimeType
      putExtra(Intent.EXTRA_TITLE, args.name)
    }
    startActivityForResult(invoke, intent, "createResult")
  }

  @ActivityCallback
  fun createResult(invoke: Invoke, result: ActivityResult) {
    val res = JSObject()
    val uri = if (result.resultCode == Activity.RESULT_OK) result.data?.data else null
    res.put("uri", uri?.toString())
    res.put("name", uri?.let { displayName(it) })
    invoke.resolve(res)
  }

  /** Belge "son açılanlar"dan kaldırılınca kalıcı izni bırakır (izin sayısı sınırlı). */
  @Command
  fun releaseDocument(invoke: Invoke) {
    val args = invoke.parseArgs(UriArgs::class.java)
    try {
      activity.contentResolver.releasePersistableUriPermission(Uri.parse(args.uri), Intent.FLAG_GRANT_READ_URI_PERMISSION)
    } catch (_: SecurityException) {
    }
    invoke.resolve()
  }

  /** Geri tuşuyla en başa gelinince uygulama kapanmaz, arka plana geçer (Android'in alışılmış davranışı). */
  @Command
  fun moveToBackground(invoke: Invoke) {
    activity.moveTaskToBack(true)
    invoke.resolve()
  }

  @Command
  fun protect(invoke: Invoke) {
    val args = invoke.parseArgs(SecretArgs::class.java)
    try {
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.ENCRYPT_MODE, secretKey())
      val sealed = cipher.iv + cipher.doFinal(args.data.toByteArray(Charsets.UTF_8))
      val res = JSObject()
      res.put("data", PREFIX + Base64.encodeToString(sealed, Base64.NO_WRAP))
      invoke.resolve(res)
    } catch (e: Exception) {
      invoke.reject("Anahtar şifrelenemedi: ${e.message}")
    }
  }

  @Command
  fun unprotect(invoke: Invoke) {
    val args = invoke.parseArgs(SecretArgs::class.java)
    try {
      if (!args.data.startsWith(PREFIX)) throw IllegalArgumentException("bilinmeyen biçim")
      val sealed = Base64.decode(args.data.substring(PREFIX.length), Base64.NO_WRAP)
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, sealed, 0, IV_LENGTH))
      val plain = cipher.doFinal(sealed, IV_LENGTH, sealed.size - IV_LENGTH)
      val res = JSObject()
      res.put("data", String(plain, Charsets.UTF_8))
      invoke.resolve(res)
    } catch (e: Exception) {
      invoke.reject("Anahtar çözülemedi: ${e.message}")
    }
  }

  private fun displayName(uri: Uri): String? =
    try {
      activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0) else null
      }
    } catch (_: Exception) {
      null
    }

  private fun secretKey(): SecretKey {
    val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (store.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  companion object {
    private const val KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "duopdf-provider-keys-v1"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_LENGTH = 12
    private const val PREFIX = "aks:"
  }
}
