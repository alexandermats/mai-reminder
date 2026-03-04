---
trigger: model_decision
description: Execute this rule if you want to run unit tests after using Electron app
---

When you want to run unit tests after having used Electron app, sqlite version will mismatch. To avoid this, you have to execte 'npm run rebuild:system' before you run unit tests
