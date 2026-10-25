package com.runeditrun.easel;

import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpCookie;
import java.util.ArrayList;

final class Api {
    static final class Failure extends Exception {
        final int status;
        Failure(int status, String message) { super(message); this.status = status; }
    }
    final Session session;
    Api(Session session) { this.session = session; }
    JSONObject get(String path) throws Exception { return request("GET", path, null); }
    JSONObject post(String path, JSONObject body) throws Exception { return request("POST", path, body); }

    JSONObject request(String method, String path, JSONObject body) throws Exception {
        if (!path.startsWith("/") || path.startsWith("//")) throw new Exception("Invalid installation route.");
        URI uri = URI.create(session.origin + path);
        HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
        connection.setUseCaches(false); connection.setRequestMethod(method);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-store");
        connection.setRequestProperty("Origin", session.origin);
        synchronized (session.cookies) {
            ArrayList<String> values = new ArrayList<>();
            for (HttpCookie cookie : session.cookies.getCookieStore().get(uri)) {
                String cookiePath = cookie.getPath() == null ? "/" : cookie.getPath();
                boolean matches = path.equals(cookiePath) || path.startsWith(cookiePath.endsWith("/") ? cookiePath : cookiePath + "/");
                if (!cookie.hasExpired() && matches && (!cookie.getSecure() || "https".equals(uri.getScheme())))
                    values.add(cookie.getName() + "=" + cookie.getValue());
            }
            // RFC 6265 request syntax; the JDK's legacy CookieManager header quotes version-one values.
            if (!values.isEmpty()) connection.setRequestProperty("Cookie", String.join("; ", values));
        }
        try {
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            synchronized (session.cookies) { session.cookies.put(uri, connection.getHeaderFields()); }
            if (status == 303 && path.equals("/auth/confirm")) {
                if (session.cookies.getCookieStore().getCookies().isEmpty()) throw new Failure(401, "No sign-in session was returned.");
                return new JSONObject();
            }
            InputStream stream = status < 400 ? connection.getInputStream() : connection.getErrorStream();
            String data = "";
            if (stream != null) try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > 16 * 1024 * 1024) throw new Exception("The response is too large.");
                    output.write(buffer, 0, count);
                }
                data = output.toString("UTF-8");
            }
            if (status < 200 || status >= 300) {
                String message = "Request refused (" + status + ").";
                try { JSONObject error = new JSONObject(data); message = error.optString("error", message); }
                catch (Exception ignored) { /* HTML and redirect responses never become app content. */ }
                throw new Failure(status == 302 || status == 303 ? 401 : status, message);
            }
            if (status == 204 || data.isEmpty()) return new JSONObject();
            if (status == 202 && !path.equals("/auth/magic-link")) throw new Failure(202, "Calculation is in progress. Refresh when it finishes.");
            try { return data.trim().startsWith("[") ? new JSONObject().put("items", new org.json.JSONArray(data)) : new JSONObject(data); }
            catch (Exception error) { throw new Failure(401, "Sign in again to this installation."); }
        } finally { connection.disconnect(); }
    }

    static JSONObject object(Object... pairs) throws Exception {
        JSONObject value = new JSONObject();
        for (int i = 0; i < pairs.length; i += 2) value.put((String) pairs[i], pairs[i + 1]);
        return value;
    }
    static String encode(String value) { return android.net.Uri.encode(value); }
}
