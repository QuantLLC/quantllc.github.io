package com.alexk.quantlauncher.data

import android.content.Context

/** Persists desktop shortcut keys as "packageName/activityName". */
class DesktopStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun loadKeys(): List<String> {
        val raw = prefs.getString(KEY_DESKTOP, null) ?: return emptyList()
        if (raw.isBlank()) return emptyList()
        return raw.split(SEP).map { it.trim() }.filter { it.isNotEmpty() }
    }

    fun saveKeys(keys: List<String>) {
        prefs.edit().putString(KEY_DESKTOP, keys.joinToString(SEP)).apply()
    }

    fun addKey(key: String, max: Int = MAX_DESKTOP): Boolean {
        val current = loadKeys().toMutableList()
        if (current.any { DockStore.sameApp(it, key) }) return false
        if (current.size >= max) return false
        current += key
        saveKeys(current)
        return true
    }

    fun removeKey(key: String) {
        saveKeys(loadKeys().filterNot { DockStore.sameApp(it, key) })
    }

    companion object {
        const val MAX_DESKTOP = 48
        private const val PREFS = "quant_launcher"
        private const val KEY_DESKTOP = "desktop_keys"
        private const val SEP = ","
    }
}
