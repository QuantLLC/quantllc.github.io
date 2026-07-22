package com.alexk.quantlauncher.data

import android.content.Context

/**
 * Persists dock app keys as "packageName/activityName" (or package-only legacy).
 */
class DockStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isConfigured(): Boolean = prefs.contains(KEY_DOCK)

    fun loadKeys(): List<String> {
        val raw = prefs.getString(KEY_DOCK, null) ?: return emptyList()
        if (raw.isBlank()) return emptyList()
        return raw.split(SEP).map { it.trim() }.filter { it.isNotEmpty() }
    }

    fun saveKeys(keys: List<String>) {
        prefs.edit().putString(KEY_DOCK, keys.joinToString(SEP)).apply()
    }

    fun addKey(key: String, max: Int = MAX_DOCK): Boolean {
        val current = loadKeys().toMutableList()
        if (current.any { sameApp(it, key) }) return false
        if (current.size >= max) return false
        current += key
        saveKeys(current)
        return true
    }

    fun removeKey(key: String) {
        saveKeys(loadKeys().filterNot { sameApp(it, key) })
    }

    companion object {
        const val MAX_DOCK = 8
        private const val PREFS = "quant_launcher"
        private const val KEY_DOCK = "dock_keys"
        private const val SEP = ","

        fun keyOf(packageName: String, activityName: String): String =
            "$packageName/$activityName"

        fun packageOf(key: String): String = key.substringBefore('/')

        fun activityOf(key: String): String? {
            val i = key.indexOf('/')
            return if (i >= 0 && i < key.lastIndex) key.substring(i + 1) else null
        }

        fun sameApp(a: String, b: String): Boolean {
            if (a == b) return true
            return packageOf(a) == packageOf(b) &&
                (activityOf(a) == null || activityOf(b) == null || activityOf(a) == activityOf(b))
        }
    }
}
