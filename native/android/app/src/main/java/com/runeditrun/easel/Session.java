package com.runeditrun.easel;

import org.json.JSONObject;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;

final class Session {
    final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
    String origin = "";
    volatile boolean signedIn;
    volatile boolean pushConsent;
    String deviceId = "";
    JSONObject state;
    int generation;

    static String installation(String entered) throws Exception {
        URI value = new URI(entered.trim());
        String host = value.getHost();
        boolean local = android.os.Build.FINGERPRINT.contains("generic") || android.os.Build.MODEL.contains("Emulator")
            || android.os.Build.PRODUCT.contains("sdk");
        boolean emulatorHttp = local && "http".equals(value.getScheme())
            && ("10.0.2.2".equals(host) || "localhost".equals(host) || "127.0.0.1".equals(host));
        if ((!"https".equals(value.getScheme()) && !emulatorHttp) || host == null || value.getUserInfo() != null
            || value.getQuery() != null || value.getFragment() != null
            || (value.getPath() != null && !value.getPath().isEmpty() && !"/".equals(value.getPath())))
            throw new Exception("Enter the installation HTTPS address.");
        return new URI(value.getScheme(), null, host, value.getPort(), null, null, null).toString();
    }

    static String confirmationToken(String pasted, String origin) throws Exception {
        String value = pasted.trim();
        if (!value.contains("://")) return value;
        URI link = new URI(value), installation = new URI(origin);
        if (!installation.getScheme().equals(link.getScheme()) || !installation.getAuthority().equals(link.getAuthority())
            || !"/auth/confirm".equals(link.getPath())) throw new Exception("Use the confirmation link from this installation.");
        for (String part : (link.getRawQuery() == null ? "" : link.getRawQuery()).split("&")) {
            if (part.startsWith("token=")) return java.net.URLDecoder.decode(part.substring(6), "UTF-8");
        }
        throw new Exception("The confirmation link has no token.");
    }

    void clearCache() { state = null; generation++; }
    void wipe() {
        clearCache(); cookies.getCookieStore().removeAll(); signedIn = false;
        origin = ""; deviceId = ""; pushConsent = false;
    }
    boolean isEmpty() { return !signedIn && state == null && origin.isEmpty() && deviceId.isEmpty()
        && !pushConsent && cookies.getCookieStore().getCookies().isEmpty(); }
}
