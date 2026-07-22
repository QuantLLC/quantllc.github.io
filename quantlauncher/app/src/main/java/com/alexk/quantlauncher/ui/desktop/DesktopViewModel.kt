package com.alexk.quantlauncher.ui.desktop

import android.app.Application
import android.content.ComponentName
import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.alexk.quantlauncher.data.AppRepository
import com.alexk.quantlauncher.data.LaunchableApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class DesktopUiState(
    val apps: List<LaunchableApp> = emptyList(),
    val dockApps: List<LaunchableApp> = emptyList(),
    val launchpadOpen: Boolean = false,
    val query: String = "",
    val loading: Boolean = true,
) {
    val filteredApps: List<LaunchableApp>
        get() {
            val q = query.trim()
            if (q.isEmpty()) return apps
            return apps.filter { it.label.contains(q, ignoreCase = true) }
        }
}

class DesktopViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = AppRepository(application.packageManager)

    var uiState by mutableStateOf(DesktopUiState())
        private set

    init {
        refreshApps()
    }

    fun refreshApps() {
        viewModelScope.launch {
            uiState = uiState.copy(loading = true)
            val apps = withContext(Dispatchers.IO) { repository.loadLaunchableApps() }
            val dock = pickDockApps(apps)
            uiState = uiState.copy(
                apps = apps,
                dockApps = dock,
                loading = false,
            )
        }
    }

    fun openLaunchpad() {
        uiState = uiState.copy(launchpadOpen = true, query = "")
    }

    fun closeLaunchpad() {
        uiState = uiState.copy(launchpadOpen = false, query = "")
    }

    fun onQueryChange(value: String) {
        uiState = uiState.copy(query = value)
    }

    fun launchApp(app: LaunchableApp) {
        val context = getApplication<Application>()
        val intent = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setComponent(ComponentName(app.packageName, app.activityName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
        closeLaunchpad()
    }

    private fun pickDockApps(apps: List<LaunchableApp>): List<LaunchableApp> {
        val preferred = listOf(
            "com.android.settings",
            "com.android.chrome",
            "com.huawei.android.launcher",
            "com.google.android.apps.photos",
            "com.google.android.gm",
            "com.android.vending",
        )
        val picked = linkedMapOf<String, LaunchableApp>()
        preferred.forEach { pkg ->
            apps.firstOrNull { it.packageName == pkg }?.let { picked[pkg] = it }
        }
        apps.asSequence()
            .filter { it.packageName !in picked }
            .take((5 - picked.size).coerceAtLeast(0))
            .forEach { picked[it.packageName] = it }
        return picked.values.toList().take(5)
    }
}
