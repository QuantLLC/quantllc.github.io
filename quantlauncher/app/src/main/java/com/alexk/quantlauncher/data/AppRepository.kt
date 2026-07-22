package com.alexk.quantlauncher.data

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.os.Build

data class LaunchableApp(
    val label: String,
    val packageName: String,
    val activityName: String,
    val icon: Drawable,
    val isGbox: Boolean = false,
)

sealed class LaunchpadItem {
    data class Section(val title: String) : LaunchpadItem()
    data class App(val app: LaunchableApp) : LaunchpadItem()
}

class AppRepository(
    private val context: Context,
    private val packageManager: PackageManager = context.packageManager,
) {

    fun loadLaunchableApps(): List<LaunchableApp> {
        val byKey = linkedMapOf<String, LaunchableApp>()

        queryLauncherApps().forEach { app ->
            byKey[key(app)] = app.copy(isGbox = markGbox(app))
        }

        // Pick up GBox-related packages that may not expose CATEGORY_LAUNCHER cleanly
        discoverGboxRelatedPackages().forEach { app ->
            byKey.putIfAbsent(key(app), app)
        }

        discoverGboxActivities().forEach { app ->
            byKey[key(app)] = app
        }

        findGboxHost()?.let { host ->
            byKey[key(host)] = host
        }

        return byKey.values.sortedWith(
            compareByDescending<LaunchableApp> { it.isGbox }
                .thenBy { it.label.lowercase() },
        )
    }

    fun buildLaunchpadItems(apps: List<LaunchableApp>, query: String = ""): List<LaunchpadItem> {
        val q = query.trim()
        val filtered = if (q.isEmpty()) {
            apps
        } else {
            apps.filter {
                it.label.contains(q, ignoreCase = true) ||
                    it.packageName.contains(q, ignoreCase = true)
            }
        }

        val gbox = filtered.filter { it.isGbox }
        val rest = filtered.filterNot { it.isGbox }
        val items = mutableListOf<LaunchpadItem>()

        if (gbox.isNotEmpty()) {
            items += LaunchpadItem.Section(context.getString(com.alexk.quantlauncher.R.string.section_gbox))
            items += gbox.map { LaunchpadItem.App(it) }
        }

        if (rest.isNotEmpty()) {
            items += LaunchpadItem.Section(context.getString(com.alexk.quantlauncher.R.string.section_all))
            items += rest.map { LaunchpadItem.App(it) }
        }
        return items
    }

    fun hasGboxInstalled(): Boolean = gboxHostPackages().any { isInstalled(it) }

    private fun markGbox(app: LaunchableApp): Boolean =
        app.isGbox || isGboxPackage(app.packageName) || installedByGbox(app.packageName)

    private fun queryLauncherApps(): List<LaunchableApp> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PackageManager.MATCH_ALL
        } else {
            0
        }
        return packageManager.queryIntentActivities(intent, flags)
            .mapNotNull { info ->
                val activity = info.activityInfo ?: return@mapNotNull null
                val pkg = activity.packageName
                if (pkg == context.packageName) return@mapNotNull null
                LaunchableApp(
                    label = info.loadLabel(packageManager)?.toString().orEmpty()
                        .ifBlank { pkg },
                    packageName = pkg,
                    activityName = activity.name,
                    icon = info.loadIcon(packageManager),
                    isGbox = isGboxPackage(pkg) || installedByGbox(pkg),
                )
            }
    }

    private fun discoverGboxRelatedPackages(): List<LaunchableApp> {
        val flags = PackageManager.GET_META_DATA
        val installed = runCatching {
            packageManager.getInstalledApplications(flags)
        }.getOrDefault(emptyList())

        return installed.mapNotNull { appInfo ->
            val pkg = appInfo.packageName
            if (pkg == context.packageName) return@mapNotNull null
            if (!isGboxPackage(pkg) && !installedByGbox(pkg)) return@mapNotNull null

            val launch = packageManager.getLaunchIntentForPackage(pkg) ?: return@mapNotNull null
            val component = launch.component ?: return@mapNotNull null
            LaunchableApp(
                label = packageManager.getApplicationLabel(appInfo).toString().ifBlank { pkg },
                packageName = component.packageName,
                activityName = component.className,
                icon = packageManager.getApplicationIcon(appInfo),
                isGbox = true,
            )
        }
    }

    private fun discoverGboxActivities(): List<LaunchableApp> {
        val hosts = gboxHostPackages().filter { isInstalled(it) }
        val out = mutableListOf<LaunchableApp>()
        for (host in hosts) {
            val info = runCatching {
                packageManager.getPackageInfo(host, PackageManager.GET_ACTIVITIES)
            }.getOrNull() ?: continue

            info.activities.orEmpty().forEach { activity ->
                if (!activity.exported) return@forEach
                val name = activity.name.lowercase()
                val interesting = listOf(
                    "main", "home", "launcher", "store", "play", "app",
                    "shortcut", "plugin", "portal", "space", "mirror", "clone",
                ).any { name.contains(it) }
                if (!interesting) return@forEach

                val label = activity.loadLabel(packageManager)?.toString().orEmpty()
                    .ifBlank { "GBox" }
                val icon = activity.loadIcon(packageManager)
                    ?: packageManager.getApplicationIcon(host)

                out += LaunchableApp(
                    label = if (label.contains("gbox", true) || label.contains("gspace", true)) {
                        label
                    } else {
                        "GBox · $label"
                    },
                    packageName = host,
                    activityName = activity.name,
                    icon = icon,
                    isGbox = true,
                )
            }
        }
        return out.distinctBy { key(it) }
    }

    private fun findGboxHost(): LaunchableApp? {
        val host = gboxHostPackages().firstOrNull { isInstalled(it) } ?: return null
        val launch = packageManager.getLaunchIntentForPackage(host) ?: return null
        val component = launch.component ?: return null
        val appInfo: ApplicationInfo = packageManager.getApplicationInfo(host, 0)
        return LaunchableApp(
            label = packageManager.getApplicationLabel(appInfo).toString().ifBlank { "GBox" },
            packageName = component.packageName,
            activityName = component.className,
            icon = packageManager.getApplicationIcon(appInfo),
            isGbox = true,
        )
    }

    private fun installedByGbox(pkg: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
        return runCatching {
            val source = packageManager.getInstallSourceInfo(pkg)
            val installer = listOfNotNull(
                source.installingPackageName,
                source.initiatingPackageName,
                source.originatingPackageName,
            )
            installer.any { isGboxPackage(it.orEmpty()) }
        }.getOrDefault(false)
    }

    private fun isInstalled(pkg: String): Boolean =
        runCatching {
            packageManager.getApplicationInfo(pkg, 0)
            true
        }.getOrDefault(false)

    private fun key(app: LaunchableApp): String = "${app.packageName}/${app.activityName}"

    companion object {
        fun gboxHostPackages(): List<String> = listOf(
            "com.gbox.android",
            "com.gboxlab.gbox",
            "com.gbox.app",
            "com.gboxspace.app",
            "com.excean.gbox",
            "com.excean.gspace",
            "com.gmail.mailserver.gbox",
        )

        fun isGboxPackage(pkg: String): Boolean {
            val p = pkg.lowercase()
            return p.contains("gbox") ||
                p.contains("gspace") ||
                p.startsWith("com.excean.g") ||
                p.startsWith("com.gbox")
        }
    }
}
