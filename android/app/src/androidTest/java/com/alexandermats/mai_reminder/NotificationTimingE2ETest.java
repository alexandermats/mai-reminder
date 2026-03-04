package com.alexandermats.mai_reminder;

import android.Manifest;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.webkit.WebView;

import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;

import org.junit.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class NotificationTimingE2ETest {

    private static final int TEST_NOTIFICATION_ID = 7654321;
    private static final String TEST_TITLE = "Android Notification Timing";
    private static final long WEBVIEW_READY_TIMEOUT_MS = 30_000;
    private static final long SCHEDULE_DELAY_MS = 15_000;
    private static final long MAX_ALLOWED_LAG_MS = 20_000;

    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
            new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void notificationAppearsNearExpectedTime() throws Exception {
        grantNotificationPermissionIfNeeded();
        waitForCapacitorLocalNotifications();

        long scheduledAt = System.currentTimeMillis() + SCHEDULE_DELAY_MS;
        scheduleNotificationFromWebView(TEST_NOTIFICATION_ID, TEST_TITLE, scheduledAt);

        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        long timeoutMs = SCHEDULE_DELAY_MS + MAX_ALLOWED_LAG_MS;

        boolean appeared = waitForNotificationInShade(device, TEST_TITLE, timeoutMs);
        Assert.assertTrue(
                "Expected notification to appear within " + timeoutMs + "ms of scheduling.",
                appeared
        );

        clearScheduledNotification(TEST_NOTIFICATION_ID);
    }

    private void grantNotificationPermissionIfNeeded() throws IOException {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return;
        }

        String packageName = InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageName();
        ParcelFileDescriptor shellOutput = InstrumentationRegistry.getInstrumentation()
                .getUiAutomation()
                .executeShellCommand("pm grant " + packageName + " " + Manifest.permission.POST_NOTIFICATIONS);
        if (shellOutput != null) {
            shellOutput.close();
        }
    }

    private void waitForCapacitorLocalNotifications() throws Exception {
        long deadline = System.currentTimeMillis() + WEBVIEW_READY_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            String result = evaluateJavascript(
                    "(function() { return !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications); })();"
            );
            if (result != null && result.contains("true")) {
                return;
            }
            Thread.sleep(500);
        }
        Assert.fail("Capacitor LocalNotifications plugin was not available in WebView.");
    }

    private void scheduleNotificationFromWebView(int id, String title, long scheduledAtMs) throws Exception {
        String escapedTitle = title.replace("'", "\\'");
        String script =
                "(function(){" +
                        "window.__notifE2EStatus='pending';" +
                        "var ln=window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;" +
                        "if(!ln){window.__notifE2EStatus='no-plugin';return;}" +
                        "ln.requestPermissions()" +
                        ".then(function(){return ln.createChannel({id:'reminders',name:'Reminders',importance:5,visibility:1,vibration:true});})" +
                        ".then(function(){return ln.schedule({notifications:[{id:" + id + ",title:'" + escapedTitle + "',body:'Android Studio e2e timing',schedule:{at:new Date(" + scheduledAtMs + "),allowWhileIdle:false},channelId:'reminders'}]});})" +
                        ".then(function(){window.__notifE2EStatus='ok';})" +
                        ".catch(function(e){window.__notifE2EStatus='error:' + (e && e.message ? e.message : String(e));});" +
                        "})();";

        evaluateJavascript(script);

        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            String status = evaluateJavascript("window.__notifE2EStatus || 'missing';");
            if (status != null && status.contains("ok")) {
                return;
            }
            if (status != null && status.contains("error:")) {
                Assert.fail("Failed to schedule notification from WebView: " + status);
            }
            Thread.sleep(300);
        }

        Assert.fail("Timed out waiting for notification scheduling to complete.");
    }

    private boolean waitForNotificationInShade(UiDevice device, String title, long timeoutMs)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            device.openNotification();
            boolean found = device.wait(Until.hasObject(By.textContains(title)), 2_000);
            device.pressBack();

            if (found) {
                return true;
            }
            Thread.sleep(1_000);
        }
        return false;
    }

    private void clearScheduledNotification(int id) throws Exception {
        evaluateJavascript(
                "(function(){" +
                        "var ln=window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;" +
                        "if(!ln){return;}" +
                        "ln.cancel({notifications:[{id:" + id + "}]});" +
                        "})();"
        );
    }

    private String evaluateJavascript(String script) throws Exception {
        AtomicReference<String> resultRef = new AtomicReference<>(null);
        CountDownLatch latch = new CountDownLatch(1);

        activityRule.getScenario().onActivity(activity -> {
            WebView webView = activity.getBridge() != null ? activity.getBridge().getWebView() : null;
            if (webView == null) {
                resultRef.set(null);
                latch.countDown();
                return;
            }
            webView.evaluateJavascript(script, value -> {
                resultRef.set(value);
                latch.countDown();
            });
        });

        boolean completed = latch.await(5, TimeUnit.SECONDS);
        if (!completed) {
            throw new AssertionError("Timed out evaluating JavaScript in WebView.");
        }

        return resultRef.get();
    }
}
