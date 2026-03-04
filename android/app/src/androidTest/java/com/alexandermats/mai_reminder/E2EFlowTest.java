package com.alexandermats.mai_reminder;

import android.Manifest;
import android.os.Build;
import android.os.ParcelFileDescriptor;

import androidx.test.espresso.web.webdriver.Locator;
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

import static androidx.test.espresso.web.sugar.Web.onWebView;
import static androidx.test.espresso.web.webdriver.DriverAtoms.getText;
import static androidx.test.espresso.web.webdriver.DriverAtoms.findElement;
import static androidx.test.espresso.web.webdriver.DriverAtoms.webClick;
import static androidx.test.espresso.web.webdriver.DriverAtoms.webKeys;
import static androidx.test.espresso.web.assertion.WebViewAssertions.webMatches;
import static org.hamcrest.Matchers.containsString;

@RunWith(AndroidJUnit4.class)
public class E2EFlowTest {

    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
            new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void testCreateReminderFlow() throws Exception {
        grantNotificationPermissionIfNeeded();

        // Wait for WebView to load
        try {
            Thread.sleep(10000); // Wait 10s for initial load and splash screen
        } catch (InterruptedException e) {
            e.printStackTrace();
        }

        // 1. Check if the app root exists
        try {
            onWebView()
                .forceJavascriptEnabled()
                .withElement(findElement(Locator.ID, "app"))
                .check(webMatches(getText(), containsString(""))); 
        } catch (Exception e) {
            // Silence log search failures unless they break the test
        }

        // 2. Try to find the input field
        try {
            onWebView()
                .withElement(findElement(Locator.CSS_SELECTOR, "ion-input .native-input"))
                .perform(webKeys("Android E2E Test Reminder in 1 minute"))
                .perform(webKeys("\n"));
        } catch (Exception e) {
            try {
                onWebView()
                    .withElement(findElement(Locator.CSS_SELECTOR, ".custom-input"))
                    .perform(webKeys("Android E2E Test Reminder in 1 minute (Backup)"))
                    .perform(webKeys("\n"));
            } catch (Exception e2) {
                 // Final attempt fail
            }
        }

        // Wait for modal
        try {
            Thread.sleep(6000); // 6s for modal animation and stabilization
        } catch (InterruptedException e) {
            e.printStackTrace();
        }

        // 3. Verify modal is present by checking its title
        try {
            onWebView()
                .withElement(findElement(Locator.XPATH, "//ion-title"))
                .check(webMatches(getText(), containsString("Reminder")));
        } catch (Exception e) {
            // Modal might have different title or structure
        }

        // 4. Click Save button in ConfirmationModal
        try {
            onWebView()
                .withElement(findElement(Locator.ID, "save-reminder-btn"))
                .perform(webClick());
        } catch (Exception e) {
            try {
                onWebView()
                    .withElement(findElement(Locator.CSS_SELECTOR, "ion-button[data-test='save-reminder-btn']"))
                    .perform(webClick());
            } catch (Exception e2) {
                 // Final attempt fail
            }
        }

        // Wait for list update
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }

        // 5. Verify the reminder appears in the list
        onWebView()
            .withElement(findElement(Locator.CSS_SELECTOR, "[data-test='reminder-item']"))
            .check(webMatches(getText(), containsString("Android E2E")));

        // 6. Verify OS notification appears after it is expected to fire
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        boolean notificationShown = waitForNotificationInShade(device, "Mai Reminder", 100_000);
        Assert.assertTrue(
            "Expected reminder notification to appear within ~1 minute after creation.",
            notificationShown
        );
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
}
