package com.alexk.quantlauncher

import android.Manifest
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.widget.doAfterTextChanged
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.alexk.quantlauncher.data.AppRepository
import com.alexk.quantlauncher.data.LaunchableApp
import com.alexk.quantlauncher.data.LaunchpadItem
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var dock: LinearLayout
    private lateinit var launchpad: FrameLayout
    private lateinit var search: EditText
    private lateinit var appGrid: RecyclerView
    private lateinit var clock: TextView
    private lateinit var wallpaper: ImageView

    private val repository by lazy { AppRepository(this) }
    private var allApps: List<LaunchableApp> = emptyList()
    private var skippedHomeThisSession = false
    private val prefs by lazy { getSharedPreferences("quant_launcher", MODE_PRIVATE) }

    private val handler = Handler(Looper.getMainLooper())
    private val clockTick = object : Runnable {
        override fun run() {
            if (::clock.isInitialized) {
                clock.text = SimpleDateFormat("EEE  HH:mm", Locale.getDefault()).format(Date())
            }
            handler.postDelayed(this, 30_000L)
        }
    }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            maybeAskDefaultHome()
        }

    private val homeRoleLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            // Returned from role / settings UI — no-op; next resume refreshes state
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.navigationBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            isAppearanceLightStatusBars = false
        }

        setContentView(R.layout.activity_main)

        dock = findViewById(R.id.dock)
        launchpad = findViewById(R.id.launchpad)
        search = findViewById(R.id.search)
        appGrid = findViewById(R.id.appGrid)
        clock = findViewById(R.id.clock)
        wallpaper = findViewById(R.id.wallpaper)

        // Prefer live system wallpaper when available
        runCatching {
            val live = android.app.WallpaperManager.getInstance(this).drawable
            if (live != null) {
                wallpaper.setImageDrawable(live)
            }
        }

        appGrid.layoutManager = GridLayoutManager(this, 5).apply {
            spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
                override fun getSpanSize(position: Int): Int {
                    val adapter = appGrid.adapter as? LaunchpadAdapter ?: return 1
                    return if (adapter.getItemViewType(position) == LaunchpadAdapter.TYPE_SECTION) {
                        spanCount
                    } else {
                        1
                    }
                }
            }
        }

        refreshApps()
        setupDock(allApps)
        renderLaunchpad("")

        launchpad.setOnClickListener { closeLaunchpad() }
        findViewById<View>(R.id.launchpadPanel).setOnClickListener { /* consume */ }

        search.doAfterTextChanged { text ->
            renderLaunchpad(text?.toString().orEmpty())
        }

        handler.post(clockTick)
        askStartupPermissions()
    }

    override fun onResume() {
        super.onResume()
        refreshApps()
        setupDock(allApps)
        if (launchpad.visibility == View.VISIBLE) {
            renderLaunchpad(search.text?.toString().orEmpty())
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        closeLaunchpad()
    }

    override fun onDestroy() {
        handler.removeCallbacks(clockTick)
        super.onDestroy()
    }

    private fun refreshApps() {
        allApps = repository.loadLaunchableApps()
    }

    private fun askStartupPermissions() {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 33) {
            val notif = Manifest.permission.POST_NOTIFICATIONS
            if (ContextCompat.checkSelfPermission(this, notif) != PackageManager.PERMISSION_GRANTED) {
                needed += notif
            }
        }

        val alreadyExplained = prefs.getBoolean(PREF_PERMS_EXPLAINED, false)
        if (alreadyExplained && needed.isEmpty()) {
            maybeAskDefaultHome()
            return
        }

        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.perm_title)
            .setMessage(R.string.perm_body)
            .setCancelable(false)
            .setPositiveButton(R.string.perm_continue) { _, _ ->
                prefs.edit().putBoolean(PREF_PERMS_EXPLAINED, true).apply()
                if (needed.isNotEmpty()) {
                    permissionLauncher.launch(needed.toTypedArray())
                } else {
                    maybeAskDefaultHome()
                }
            }
            .show()
    }

    private fun maybeAskDefaultHome() {
        if (isDefaultLauncher()) return
        if (skippedHomeThisSession) return

        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.home_title)
            .setMessage(R.string.home_body)
            .setCancelable(false)
            .setPositiveButton(R.string.home_set) { _, _ -> requestDefaultHome() }
            .setNegativeButton(R.string.home_later) { _, _ ->
                skippedHomeThisSession = true
            }
            .show()
    }

    private fun isDefaultLauncher(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            if (roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_HOME)) {
                if (roleManager.isRoleHeld(RoleManager.ROLE_HOME)) return true
            }
        }
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val resolved = packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        return resolved?.activityInfo?.packageName == packageName
    }

    private fun requestDefaultHome() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            if (roleManager != null &&
                roleManager.isRoleAvailable(RoleManager.ROLE_HOME) &&
                !roleManager.isRoleHeld(RoleManager.ROLE_HOME)
            ) {
                homeRoleLauncher.launch(roleManager.createRequestRoleIntent(RoleManager.ROLE_HOME))
                return
            }
        }
        val settings = Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (settings.resolveActivity(packageManager) != null) {
            homeRoleLauncher.launch(settings)
        } else {
            val chooser = Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(Intent.createChooser(chooser, getString(R.string.home_set)))
        }
    }

    private fun setupDock(apps: List<LaunchableApp>) {
        dock.removeAllViews()

        val launchpadBtn = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(58), dp(58)).also { lp ->
                lp.marginEnd = dp(10)
            }
            setBackgroundResource(R.drawable.bg_launchpad_btn)
            contentDescription = getString(R.string.launchpad)
            elevation = dp(2).toFloat()
            setOnClickListener { openLaunchpad() }
        }
        val gridIcon = ImageView(this).apply {
            layoutParams = FrameLayout.LayoutParams(dp(24), dp(24)).also {
                it.gravity = android.view.Gravity.CENTER
            }
            setImageResource(R.drawable.ic_grid)
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        launchpadBtn.addView(gridIcon)
        dock.addView(launchpadBtn)

        val preferred = listOf(
            "com.gbox.android",
            "com.excean.gbox",
            "com.excean.gspace",
            "com.gboxspace.app",
            "com.android.settings",
            "com.android.chrome",
            "com.huawei.browser",
            "com.huawei.hwvplayer.youku",
            "com.android.vending",
        )
        val dockApps = LinkedHashMap<String, LaunchableApp>()
        preferred.forEach { pkg ->
            apps.firstOrNull { it.packageName == pkg }?.let { dockApps[pkg] = it }
        }
        apps.firstOrNull { it.isGbox && it.packageName !in dockApps }?.let {
            dockApps.putIfAbsent(it.packageName, it)
        }
        apps.asSequence()
            .filter { it.packageName !in dockApps }
            .take((6 - dockApps.size).coerceAtLeast(0))
            .forEach { dockApps[it.packageName] = it }

        dockApps.values.forEach { app ->
            val tile = FrameLayout(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(58), dp(58)).also { lp ->
                    lp.marginEnd = dp(10)
                }
                setBackgroundResource(R.drawable.bg_icon_tile)
                setPadding(dp(9), dp(9), dp(9), dp(9))
                setOnClickListener { launch(app) }
            }
            val icon = ImageView(this).apply {
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                )
                setImageDrawable(app.icon)
                contentDescription = app.label
                scaleType = ImageView.ScaleType.FIT_CENTER
            }
            tile.addView(icon)
            if (app.isGbox) {
                val badge = TextView(this).apply {
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                        FrameLayout.LayoutParams.WRAP_CONTENT,
                    ).also {
                        it.gravity = android.view.Gravity.TOP or android.view.Gravity.END
                    }
                    text = "G"
                    textSize = 9f
                    setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_primary))
                    setBackgroundResource(R.drawable.bg_gbox_badge)
                    setPadding(dp(4), dp(1), dp(4), dp(1))
                }
                tile.addView(badge)
            }
            dock.addView(tile)
        }
    }

    private fun renderLaunchpad(query: String) {
        val items = repository.buildLaunchpadItems(allApps, query)
        appGrid.adapter = LaunchpadAdapter(items) { launch(it) }
    }

    private fun openLaunchpad() {
        refreshApps()
        launchpad.visibility = View.VISIBLE
        search.setText("")
        renderLaunchpad("")
        search.requestFocus()
    }

    private fun closeLaunchpad() {
        launchpad.visibility = View.GONE
    }

    private fun launch(app: LaunchableApp) {
        val intent = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setComponent(ComponentName(app.packageName, app.activityName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val ok = runCatching { startActivity(intent) }.isSuccess
        if (!ok) {
            packageManager.getLaunchIntentForPackage(app.packageName)?.let { startActivity(it) }
        }
        closeLaunchpad()
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val PREF_PERMS_EXPLAINED = "perms_explained"
    }
}

private class LaunchpadAdapter(
    private val items: List<LaunchpadItem>,
    private val onClick: (LaunchableApp) -> Unit,
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        const val TYPE_SECTION = 0
        const val TYPE_APP = 1
    }

    class SectionHolder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.sectionTitle)
    }

    class AppHolder(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.icon)
        val label: TextView = view.findViewById(R.id.label)
        val badge: TextView = view.findViewById(R.id.gboxBadge)
    }

    override fun getItemViewType(position: Int): Int = when (items[position]) {
        is LaunchpadItem.Section -> TYPE_SECTION
        is LaunchpadItem.App -> TYPE_APP
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return if (viewType == TYPE_SECTION) {
            SectionHolder(inflater.inflate(R.layout.item_section, parent, false))
        } else {
            AppHolder(inflater.inflate(R.layout.item_app, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val item = items[position]) {
            is LaunchpadItem.Section -> {
                (holder as SectionHolder).title.text = item.title
            }
            is LaunchpadItem.App -> {
                val h = holder as AppHolder
                val app = item.app
                h.icon.setImageDrawable(app.icon)
                h.label.text = app.label
                h.badge.visibility = if (app.isGbox) View.VISIBLE else View.GONE
                h.itemView.setOnClickListener { onClick(app) }
            }
        }
    }

    override fun getItemCount(): Int = items.size
}
