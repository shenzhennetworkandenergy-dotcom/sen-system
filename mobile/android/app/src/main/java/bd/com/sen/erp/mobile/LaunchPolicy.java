package bd.com.sen.erp.mobile;

import java.net.URI;
import java.net.URISyntaxException;

final class LaunchPolicy {
    private LaunchPolicy() {}
    static boolean isAllowed(String url) {
        try {
            URI value = new URI(url);
            return "https".equalsIgnoreCase(value.getScheme())
                && ("www.sen.com.bd".equalsIgnoreCase(value.getHost()) || "sen.com.bd".equalsIgnoreCase(value.getHost()))
                && value.getRawUserInfo() == null && (value.getPort() == -1 || value.getPort() == 443);
        } catch (URISyntaxException | NullPointerException error) {
            return false;
        }
    }
}
