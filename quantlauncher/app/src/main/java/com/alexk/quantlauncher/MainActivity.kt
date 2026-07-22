package com.alexk.quantlauncher

import android.Manifest
import android.app.WallpaperManager
import android.app.role.RoleManager
import android.content.ClipData
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Point
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.DragEvent
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
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
import com.alexk.quantlauncher.data.DockStore
import com.alexk.quantlauncher.data.LaunchableApp
import com.alexk.quantlauncher.data.LaunchpadItem
import com.google.android.material.dialog.MaterialAlertDialogBuilder

class MainActivity : AppCompatActivity() {
    private lateinit var dock: LinearLayout
    private lateinit var dockArea: FrameLayout
    private lateinit var launchpad: FrameLayout
    private lateinit var launchpadTitle: TextView
    private lateinit var search: EditText
    private lateinit var appGrid: RecyclerView
    private lateinit var wallpaper: ImageView
    private lateinit var scrim: View

    private val repository by lazy { AppRepository(this) }
    private val dockStore by lazy { DockStore(this) }
    private var allApps: List<LaunchableApp> = emptyList()
    private var skippedHomeThisSession = false
    private var dockEditMode = false
    private val prefs by lazy { getSharedPreferences("quant_launcher", MODE_PRIVATE) }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            loadWallpaper()
            maybeAskDefaultHome()
        }

    private val homeRoleLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            // Returned from role / settings UI
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
        dockArea = findViewById(R.id.dockArea)
        launchpad = findViewById(R.id.launchpad)
        launchpadTitle = findViewById(R.id.launchpadTitle)
        search = findViewById(R.id.search)
        appGrid = findViewById(R.id.appGrid)
        wallpaper = findViewById(R.id.wallpaper)
        scrim = findViewById(R.id.scrim)

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
        ensureDefaultDock()
        setupDock()
        renderLaunchpad("")
        loadWallpaper()

        launchpad.setOnClickListener {
            closeLaunchpad()
        }
        findViewById<View>(R.id.launchpadPanel).setOnClickListener { /* consume */ }

        search.doAfterTextChanged { text ->
            renderLaunchpad(text?.toString().orEmpty())
        }

        // Long-press vacant dock space → settings menu
        dock.setOnLongClickListener { v ->
            showDockSettingsMenu(v)
            true
        }
        dockArea.setOnLongClickListener { v ->
            showDockSettingsMenu(v)
            true
        }

        // Drop target for drag-from-launchpad while editing
        val dropListener = View.OnDragListener { _, event ->
            when (event.action) {
                DragEvent.ACTION_DRAG_STARTED ->
                    event.clipDescription?.hasMimeType(MIME_DOCK_APP) == true
                DragEvent.ACTION_DRAG_ENTERED -> {
                    dock.alpha = 0.85f
                    true
                }
                DragEvent.ACTION_DRAG_EXITED -> {
                    dock.alpha = 1f
                    true
                }
                DragEvent.ACTION_DROP -> {
                    dock.alpha = 1f
                    val key = event.clipData?.getItemAt(0)?.text?.toString().orEmpty()
                    if (key.isNotEmpty()) {
                        addAppToDock(key)
                    }
                    true
                }
                DragEvent.ACTION_DRAG_ENDED -> {
                    dock.alpha = 1f
                    true
                }
                else -> true
            }
        }
        dock.setOnDragListener(dropListener)
        dockArea.setOnDragListener(dropListener)

        askStartupPermissions()
    }

    override fun onResume() {
        super.onResume()
        refreshApps()
        setupDock()
        loadWallpaper()
        if (launchpad.visibility == View.VISIBLE) {
            renderLaunchpad(search.text?.toString().orEmpty())
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        closeLaunchpad()
    }

    private fun refreshApps() {
        allApps = repository.loadLaunchableApps()
    }

    private fun ensureDefaultDock() {
        if (dockStore.isConfigured()) return
        val preferred = listOf(
            "com.gbox.android",
            "com.excean.gbox",
            "com.excean.gspace",
            "com.android.settings",
            "com.android.chrome",
            "com.huawei.browser",
            "com.android.vending",
        )
        val keys = mutableListOf<String>()
        preferred.forEach { pkg ->
            allApps.firstOrNull { it.packageName == pkg }?.let {
                keys += DockStore.keyOf(it.packageName, it.activityName)
            }
        }
        if (keys.isEmpty()) {
            allApps.take(4).forEach {
                keys += DockStore.keyOf(it.packageName, it.activityName)
            }
        }
        dockStore.saveKeys(keys.take(DockStore.MAX_DOCK))
    }

    private fun resolveDockApps(): List<LaunchableApp> {
        val keys = dockStore.loadKeys()
        val resolved = mutableListOf<LaunchableApp>()
        val missing = mutableListOf<String>()
        for (key in keys) {
            val pkg = DockStore.packageOf(key)
            val act = DockStore.activityOf(key)
            val match = allApps.firstOrNull {
                it.packageName == pkg && (act == null || it.activityName == act)
            } ?: allApps.firstOrNull { it.packageName == pkg }
            if (match != null) {
                resolved += match
            } else {
                missing += key
            }
        }
        if (missing.isNotEmpty()) {
            dockStore.saveKeys(keys.filterNot { it in missing })
        }
        return resolved
    }

    private fun storagePermissions(): List<String> {
        return if (Build.VERSION.SDK_INT >= 33) {
            listOf(Manifest.permission.READ_MEDIA_IMAGES)
        } else {
            listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
    }

    private fun neededRuntimePermissions(): List<String> {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= 33) {
            val notif = Manifest.permission.POST_NOTIFICATIONS
            if (ContextCompat.checkSelfPermission(this, notif) != PackageManager.PERMISSION_GRANTED) {
                needed += notif
            }
        }
        storagePermissions().forEach { perm ->
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needed += perm
            }
        }
        return needed
    }

    private fun askStartupPermissions() {
        val needed = neededRuntimePermissions()
        val alreadyExplained = prefs.getBoolean(PREF_PERMS_EXPLAINED, false)
        if (alreadyExplained && needed.isEmpty()) {
            loadWallpaper()
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
                    loadWallpaper()
                    maybeAskDefaultHome()
                }
            }
            .show()
    }

    private fun loadWallpaper() {
        // Prefer live system wallpaper; fall back to gradient drawable in layout.
        val live = runCatching {
            WallpaperManager.getInstance(this).drawable
        }.getOrNull()

        if (live != null) {
            wallpaper.setImageDrawable(live)
            // Light scrim so icons stay readable on bright wallpapers
            scrim.alpha = 0.45f
        } else {
            wallpaper.setImageResource(R.drawable.wallpaper)
            scrim.alpha = 1f
        }
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

    private fun showDockSettingsMenu(anchor: View) {
        val popup = PopupMenu(this, anchor, Gravity.CENTER)
        popup.menu.add(0, MENU_SETTINGS, 0, getString(R.string.settings))
        popup.setOnMenuItemClickListener { item ->
            if (item.itemId == MENU_SETTINGS) {
                openDockEditor()
                true
            } else {
                false
            }
        }
        popup.show()
    }

    private fun openDockEditor() {
        dockEditMode = true
        launchpadTitle.visibility = View.VISIBLE
        launchpadTitle.text = getString(R.string.customize_dock_hint)
        openLaunchpadInternal()
    }

    private fun setupDock() {
        dock.removeAllViews()

        // Launchpad button
        dock.addView(createLaunchpadButton())

        resolveDockApps().forEach { app ->
            dock.addView(createDockAppTile(app))
        }

        // Vacant space at the end — long-press for settings
        val vacant = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(72), dp(58)).also { lp ->
                lp.marginStart = dp(4)
            }
            contentDescription = getString(R.string.dock_settings)
            isClickable = true
            isLongClickable = true
            setOnLongClickListener { v ->
                showDockSettingsMenu(v)
                true
            }
            // Also allow empty tap area to feel like dock padding
            setOnClickListener { /* vacant */ }
        }
        dock.addView(vacant)
    }

    private fun createLaunchpadButton(): View {
        val launchpadBtn = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(58), dp(58)).also { lp ->
                lp.marginEnd = dp(10)
            }
            setBackgroundResource(R.drawable.bg_launchpad_btn)
            contentDescription = getString(R.string.launchpad)
            elevation = dp(2).toFloat()
            setOnClickListener {
                dockEditMode = false
                launchpadTitle.visibility = View.GONE
                openLaunchpadInternal()
            }
            // Don't open settings from the launchpad button long-press
            isLongClickable = false
        }
        val gridIcon = ImageView(this).apply {
            layoutParams = FrameLayout.LayoutParams(dp(24), dp(24)).also {
                it.gravity = Gravity.CENTER
            }
            setImageResource(R.drawable.ic_grid)
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        launchpadBtn.addView(gridIcon)
        return launchpadBtn
    }

    private fun createDockAppTile(app: LaunchableApp): View {
        val key = DockStore.keyOf(app.packageName, app.activityName)
        val tile = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(58), dp(58)).also { lp ->
                lp.marginEnd = dp(10)
            }
            setBackgroundResource(R.drawable.bg_icon_tile)
            setPadding(dp(9), dp(9), dp(9), dp(9))
            tag = key
            setOnClickListener { launch(app) }
            setOnLongClickListener {
                confirmRemoveFromDock(app)
                true
            }
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
            tile.addView(createGboxBadge())
        }
        return tile
    }

    private fun createGboxBadge(): TextView =
        TextView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).also {
                it.gravity = Gravity.TOP or Gravity.END
            }
            text = "G"
            textSize = 9f
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_primary))
            setBackgroundResource(R.drawable.bg_gbox_badge)
            setPadding(dp(4), dp(1), dp(4), dp(1))
        }

    private fun confirmRemoveFromDock(app: LaunchableApp) {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.remove_dock_title)
            .setMessage(getString(R.string.remove_dock_body, app.label))
            .setPositiveButton(R.string.confirm) { _, _ ->
                dockStore.removeKey(DockStore.keyOf(app.packageName, app.activityName))
                setupDock()
            }
            .setNegativeButton(R.string.no, null)
            .show()
    }

    private fun addAppToDock(key: String) {
        val pkg = DockStore.packageOf(key)
        val act = DockStore.activityOf(key)
        val app = allApps.firstOrNull {
            it.packageName == pkg && (act == null || it.activityName == act)
        } ?: allApps.firstOrNull { it.packageName == pkg }

        if (app == null) return

        val fullKey = DockStore.keyOf(app.packageName, app.activityName)
        when {
            dockStore.loadKeys().any { DockStore.sameApp(it, fullKey) } -> {
                Toast.makeText(this, R.string.dock_already, Toast.LENGTH_SHORT).show()
            }
            !dockStore.addKey(fullKey) -> {
                Toast.makeText(
                    this,
                    getString(R.string.dock_full, DockStore.MAX_DOCK),
                    Toast.LENGTH_SHORT,
                ).show()
            }
            else -> {
                Toast.makeText(this, R.string.dock_added, Toast.LENGTH_SHORT).show()
                setupDock()
            }
        }
    }

    private fun renderLaunchpad(query: String) {
        val items = repository.buildLaunchpadItems(allApps, query)
        appGrid.adapter = LaunchpadAdapter(
            items = items,
            dragEnabled = dockEditMode,
            onClick = { app ->
                if (dockEditMode) {
                    // Tap also adds while editing (tablet-friendly)
                    addAppToDock(DockStore.keyOf(app.packageName, app.activityName))
                } else {
                    launch(app)
                }
            },
            onDragStart = { view, app ->
                val key = DockStore.keyOf(app.packageName, app.activityName)
                val clip = ClipData.newPlainText(MIME_DOCK_APP, key)
                val shadow = object : View.DragShadowBuilder(view) {
                    override fun onProvideShadowMetrics(outShadowSize: Point, outShadowTouchPoint: Point) {
                        val size = dp(64)
                        outShadowSize.set(size, size)
                        outShadowTouchPoint.set(size / 2, size / 2)
                    }

                    override fun onDrawShadow(canvas: Canvas) {
                        view.draw(canvas)
                    }
                }
                view.startDragAndDrop(clip, shadow, app, 0)
            },
        )
    }

    private fun openLaunchpadInternal() {
        refreshApps()
        launchpad.visibility = View.VISIBLE
        search.setText("")
        renderLaunchpad("")
        if (!dockEditMode) {
            search.requestFocus()
        }
    }

    private fun closeLaunchpad() {
        launchpad.visibility = View.GONE
        dockEditMode = false
        launchpadTitle.visibility = View.GONE
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
        private const val MENU_SETTINGS = 1
        private const val MIME_DOCK_APP = "text/plain"
    }
}

private class LaunchpadAdapter(
    private val items: List<LaunchpadItem>,
    private val dragEnabled: Boolean,
    private val onClick: (LaunchableApp) -> Unit,
    private val onDragStart: (View, LaunchableApp) -> Unit,
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
                if (dragEnabled) {
                    h.itemView.setOnLongClickListener { v ->
                        onDragStart(v, app)
                        true
                    }
                } else {
                    h.itemView.setOnLongClickListener(null)
                    h.itemView.isLongClickable = false
                }
            }
        }
    }

    override fun getItemCount(): Int = items.size
}
