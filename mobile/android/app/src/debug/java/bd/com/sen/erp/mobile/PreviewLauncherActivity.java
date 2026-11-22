package bd.com.sen.erp.mobile;

import android.net.Uri;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Separate debug APK, never included in the signed public release. */
public final class PreviewLauncherActivity extends LauncherActivity {
    @Override protected Uri getLaunchingUrl() {
        return Uri.parse("http://127.0.0.1:3022/?source=android-preview");
    }
}
