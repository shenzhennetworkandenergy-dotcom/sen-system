package bd.com.sen.erp.mobile;

import android.net.Uri;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Use the device's browser for all ERP capabilities and its existing session. */
public final class SenLauncherActivity extends LauncherActivity {
    @Override
    protected Uri getLaunchingUrl() {
        Uri requested = super.getLaunchingUrl();
        // External intents must never turn SEN into a launcher for an arbitrary site.
        if (LaunchPolicy.isAllowed(requested.toString())) return requested;
        return Uri.parse("https://www.sen.com.bd/?source=android");
    }
}
