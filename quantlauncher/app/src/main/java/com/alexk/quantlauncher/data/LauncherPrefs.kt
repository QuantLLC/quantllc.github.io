package com.alexk.quantlauncher.data

import android.content.Context

class LauncherPrefs(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    var showIconLabels: Boolean
        get() = prefs.getBoolean(KEY_LABELS, true)
        set(value) = prefs.edit().putBoolean(KEY_LABELS, value).apply()

    companion object {
        private const val PREFS = "quant_launcher"
        private const val KEY_LABELS = "show_icon_labels"
    }
}
