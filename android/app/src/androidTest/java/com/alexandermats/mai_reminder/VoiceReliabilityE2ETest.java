package com.alexandermats.mai_reminder;

import static androidx.test.espresso.web.assertion.WebViewAssertions.webMatches;
import static androidx.test.espresso.web.sugar.Web.onWebView;
import static androidx.test.espresso.web.webdriver.DriverAtoms.findElement;
import static androidx.test.espresso.web.webdriver.DriverAtoms.getText;
import static androidx.test.espresso.web.webdriver.DriverAtoms.webClick;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

import android.util.Log;
import androidx.test.espresso.web.webdriver.Locator;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject;
import androidx.test.uiautomator.UiSelector;
import org.junit.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class VoiceReliabilityE2ETest {
  private static final String TAG = "VoiceReliabilityE2E";
  private static final String APP_ID = "com.alexandermats.mai_reminder";

  @Rule
  public ActivityScenarioRule<MainActivity> activityRule =
      new ActivityScenarioRule<>(MainActivity.class);

  @Test
  public void repeatedVoiceSessionsEmitFinalResultsReliably() {
    waitForAppBootstrap();
    resetVoiceTestHooks();
    ensureMicrophonePermission("allow");

    for (int i = 0; i < 5; i++) {
      tapStartRecording();
      waitForSessionCount(i + 1);
      sleep(1100);
      tapStopRecordingIfVisible();
      waitForIdle();
    }

    assertHookContains("voice-test-session-count", "5");
    assertHookContains("voice-test-final-count", "5");
    assertHookEquals("voice-test-last-error", "");
  }

  @Test
  public void permissionDenyAndGrantPathsAreHandled() {
    waitForAppBootstrap();
    resetVoiceTestHooks();

    ensureMicrophonePermission("deny");
    tapStartRecording();
    dismissPermissionDialog("deny");
    sleep(1200);
    assertHookContains("voice-test-last-error", "permission_denied");
    waitForIdle();

    ensureMicrophonePermission("allow");
    tapStartRecording();
    dismissPermissionDialog("allow");
    waitForSessionCount(1);
    tapStopRecordingIfVisible();
    waitForIdle();
    assertHookEquals("voice-test-last-error", "");
  }

  @Test
  public void languageSwitchingUpdatesVoiceRecorderLanguageHook() {
    waitForAppBootstrap();
    resetVoiceTestHooks();
    ensureMicrophonePermission("allow");

    setLanguage("ru");
    tapStartRecording();
    dismissPermissionDialog("allow");
    waitForIdle();
    assertHookContains("voice-test-last-language", "ru-RU");

    setLanguage("en");
    tapStartRecording();
    dismissPermissionDialog("allow");
    waitForIdle();
    assertHookContains("voice-test-last-language", "en-US");
  }

  private void waitForAppBootstrap() {
    sleep(10000);
    onWebView().forceJavascriptEnabled().withElement(findElement(Locator.ID, "app"));
    waitForHookToContain("voice-test-session-count", "0", 10000);
  }

  private void tapStartRecording() {
    onWebView()
        .withElement(findElement(Locator.CSS_SELECTOR, ".mic-button"))
        .perform(webClick());
  }

  private void tapStopRecordingIfVisible() {
    try {
      onWebView()
          .withElement(findElement(Locator.CSS_SELECTOR, "[data-test='stop-recording-btn']"))
          .perform(webClick());
    } catch (Exception ignored) {
      Log.d(TAG, "Stop button not visible, session likely auto-completed.");
    }
  }

  private void waitForSessionCount(int count) {
    waitForHookToContain("voice-test-session-count", String.valueOf(count), 7000);
    sleep(300);
  }

  private void waitForIdle() {
    sleep(1500);
    onWebView()
        .withElement(findElement(Locator.CSS_SELECTOR, ".mic-button"))
        .check(webMatches(getText(), containsString("")));
  }

  private void ensureMicrophonePermission(String mode) {
    if ("deny".equals(mode)) {
      executeShellCommand("pm revoke " + APP_ID + " android.permission.RECORD_AUDIO");
    } else {
      executeShellCommand("pm grant " + APP_ID + " android.permission.RECORD_AUDIO");
    }
    sleep(500);
  }

  private void dismissPermissionDialog(String mode) {
    UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
    sleep(1500);

    if ("allow".equals(mode) && clickFirstMatching(device, new String[] {
      "com.android.permissioncontroller:id/permission_allow_foreground_only_button",
      "com.android.permissioncontroller:id/permission_allow_button",
      "android:id/button1"
    })) {
      return;
    }

    if ("deny".equals(mode) && clickFirstMatching(device, new String[] {
      "com.android.permissioncontroller:id/permission_deny_button",
      "com.android.permissioncontroller:id/permission_deny_and_dont_ask_again_button",
      "android:id/button2"
    })) {
      return;
    }

    if ("allow".equals(mode)) {
      clickFirstByText(device, new String[] {"Allow", "While using the app", "ALLOW"});
    } else {
      clickFirstByText(device, new String[] {"Deny", "Don't allow", "DENY"});
    }
  }

  private boolean clickFirstMatching(UiDevice device, String[] resourceIds) {
    for (String resourceId : resourceIds) {
      UiObject button = device.findObject(new UiSelector().resourceId(resourceId));
      if (button.waitForExists(1500)) {
        try {
          button.click();
          sleep(400);
          return true;
        } catch (Exception ignored) {
          // continue
        }
      }
    }
    return false;
  }

  private void clickFirstByText(UiDevice device, String[] labels) {
    for (String label : labels) {
      UiObject button = device.findObject(new UiSelector().textContains(label));
      if (button.waitForExists(1200)) {
        try {
          button.click();
          sleep(400);
          return;
        } catch (Exception ignored) {
          // continue
        }
      }
    }
  }

  private void setLanguage(String language) {
    activityRule
        .getScenario()
        .onActivity(
            (activity) ->
                activity.runOnUiThread(
                    () ->
                        activity
                            .getBridge()
                            .getWebView()
                            .evaluateJavascript(
                                "window.localStorage.setItem('app-language','"
                                    + language
                                    + "');window.location.reload();",
                                null)));
    sleep(3000);
  }

  private void resetVoiceTestHooks() {
    setLanguage("en");
    waitForHookToContain("voice-test-session-count", "0", 10000);
    waitForHookToContain("voice-test-final-count", "0", 10000);
    assertHookEquals("voice-test-last-error", "");
  }

  private void assertHookContains(String hookId, String expected) {
    onWebView()
        .withElement(findElement(Locator.CSS_SELECTOR, "[data-test='" + hookId + "']"))
        .check(webMatches(getText(), containsString(expected)));
  }

  private void assertHookEquals(String hookId, String expected) {
    onWebView()
        .withElement(findElement(Locator.CSS_SELECTOR, "[data-test='" + hookId + "']"))
        .check(webMatches(getText(), equalTo(expected)));
  }

  private void waitForHookToContain(String hookId, String expectedValueOrNull, long timeoutMs) {
    long start = System.currentTimeMillis();
    while (System.currentTimeMillis() - start < timeoutMs) {
      try {
        if (expectedValueOrNull == null) {
          onWebView()
              .withElement(findElement(Locator.CSS_SELECTOR, "[data-test='" + hookId + "']"))
              .check(webMatches(getText(), containsString("")));
          return;
        }
        assertHookContains(hookId, expectedValueOrNull);
        return;
      } catch (Exception ignored) {
        sleep(250);
      }
    }
    Assert.fail(
        "Timed out waiting for hook " + hookId + " to contain value: " + expectedValueOrNull
    );
  }

  private void executeShellCommand(String command) {
    try {
      UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).executeShellCommand(command);
    } catch (Exception error) {
      Log.w(TAG, "Shell command failed: " + command, error);
    }
  }

  private void sleep(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException ignored) {
      Thread.currentThread().interrupt();
    }
  }
}
