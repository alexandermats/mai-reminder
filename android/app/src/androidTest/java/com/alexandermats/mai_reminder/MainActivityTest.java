package com.alexandermats.mai_reminder;

import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class MainActivityTest {

    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
            new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void testWebViewIsDisplayed() {
        activityRule.getScenario().onActivity(activity -> {
            Assert.assertNotNull("Bridge should be initialized", activity.getBridge());
            Assert.assertNotNull("Capacitor WebView should be present", activity.getBridge().getWebView());
            Assert.assertTrue(
                "Capacitor WebView should be attached to window",
                activity.getBridge().getWebView().isAttachedToWindow()
            );
        });
    }
}
