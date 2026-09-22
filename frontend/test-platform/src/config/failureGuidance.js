// Next steps per heuristic failure category (see new_backend/modules/reporting/service.py FAILURE_CATEGORIES).
export const FAILURE_GUIDANCE = {
  ocr:       'OCR could not read or match on-screen text. Check the step screenshot, the Tesseract language data and the crop region in tests/utils/ocr_utils.py.',
  locator:   'An element could not be found. Compare the screen with the locator JSON in tests/locators/ — the id or text may have changed in this build.',
  timeout:   'A wait expired. Check device and network speed, then the timeouts in tests/utils/wait_utils.py before raising them.',
  session:   'The Appium or WebDriver session failed. Confirm Appium is running and the device is online in Device Lab, then re-run.',
  network:   'A backend or API call failed. Check the API Testing matrix for the same endpoints and the environment’s health.',
  assertion: 'The app responded but the result was not what the test expected. Confirm whether this is a product bug and raise it in Jira.',
  other:     'No known pattern matched. Open the Allure report for the full trace and step screenshots.',
};
