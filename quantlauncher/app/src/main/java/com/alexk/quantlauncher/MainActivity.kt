package com.alexk.quantlauncher

import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doAfterTextChanged
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.alexk.quantlauncher.data.AppRepository
import com.alexk.quantlauncher.data.LaunchableApp

class MainActivity : AppCompatActivity() {
    private lateinit var dock: LinearLayout
    private lateinit var launchpad: FrameLayout
    private lateinit var search: EditText
    private lateinit var appGrid: RecyclerView

    private val repository by lazy { AppRepository(packageManager) }
    private var allApps: List<LaunchableApp> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        dock = findViewById(R.id.dock)
        launchpad = findViewById(R.id.launchpad)
        search = findViewById(R.id.search)
        appGrid = findViewById(R.id.appGrid)

        appGrid.layoutManager = GridLayoutManager(this, 5)

        allApps = repository.loadLaunchableApps()
        setupDock(allApps)
        showApps(allApps)

        launchpad.setOnClickListener { closeLaunchpad() }
        search.doAfterTextChanged { text ->
            val q = text?.toString().orEmpty().trim()
            val filtered = if (q.isEmpty()) {
                allApps
            } else {
                allApps.filter { it.label.contains(q, ignoreCase = true) }
            }
            showApps(filtered)
        }
    }

    private fun setupDock(apps: List<LaunchableApp>) {
        dock.removeAllViews()

        val launchpadBtn = ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(52), dp(52)).also { lp ->
                lp.marginEnd = dp(10)
            }
            setBackgroundColor(0xFF3DDC84.toInt())
            contentDescription = "Launchpad"
            setOnClickListener { openLaunchpad() }
        }
        dock.addView(launchpadBtn)

        apps.take(5).forEach { app ->
            val icon = ImageView(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(52), dp(52)).also { lp ->
                    lp.marginEnd = dp(10)
                }
                setImageDrawable(app.icon)
                contentDescription = app.label
                setOnClickListener { launch(app) }
            }
            dock.addView(icon)
        }
    }

    private fun showApps(apps: List<LaunchableApp>) {
        appGrid.adapter = AppAdapter(apps) { launch(it) }
    }

    private fun openLaunchpad() {
        launchpad.visibility = View.VISIBLE
        search.setText("")
        showApps(allApps)
    }

    private fun closeLaunchpad() {
        launchpad.visibility = View.GONE
    }

    private fun launch(app: LaunchableApp) {
        val intent = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setComponent(ComponentName(app.packageName, app.activityName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { startActivity(intent) }
        closeLaunchpad()
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()
}

private class AppAdapter(
    private val apps: List<LaunchableApp>,
    private val onClick: (LaunchableApp) -> Unit,
) : RecyclerView.Adapter<AppAdapter.Holder>() {

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.icon)
        val label: TextView = view.findViewById(R.id.label)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_app, parent, false)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val app = apps[position]
        holder.icon.setImageDrawable(app.icon)
        holder.label.text = app.label
        holder.itemView.setOnClickListener { onClick(app) }
    }

    override fun getItemCount(): Int = apps.size
}
