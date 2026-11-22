package bd.com.sen.erp.mobile;

import org.junit.Test;
import static org.junit.Assert.*;

public class LaunchPolicyTest {
    @Test public void allowsPublicAndProtectedSenRoutes() {
        for (String url : new String[] {"https://www.sen.com.bd/", "https://sen.com.bd/admin/sales/new?quotation=123", "https://www.sen.com.bd:443/employee/hr", "https://WWW.SEN.COM.BD/account"}) assertTrue(url, LaunchPolicy.isAllowed(url));
    }
    @Test public void rejectsUntrustedOriginsAndDowngrades() {
        for (String url : new String[] {"http://sen.com.bd/", "https://sen.com.bd.evil.test", "https://sen.com.bd@evil.test", "https://user@sen.com.bd", "https://sen.com.bd:444/", "javascript:alert(1)", "file:///etc/passwd", "https://murshidaproperties.sen.com.bd", "not a url", "//sen.com.bd"}) assertFalse(url, LaunchPolicy.isAllowed(url));
        assertFalse(LaunchPolicy.isAllowed(null));
    }
}
