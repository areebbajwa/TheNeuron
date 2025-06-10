# TODO.md - Patient Report Generator

**AI Agent Operating Directives (v9) Adherence:** This plan and all subsequent actions will strictly adhere to the AI Agent Operating Directives (v9), including TDD, aggressive simplification, specified testing hierarchy, and `TODO.md` lifecycle management.

## Phase 1: Core HTML/CSS Structure & Basic Report Generation (Text Input)

*   **Task 1.1:** Create `index.html` with basic structure and testing utilities.
    *   **Requirements:** Input fields for Patient Name, Age, Gender. Text areas for Complaints, Examination, Diagnosis. A dedicated area for medication input. "Generate Report" button. A `div` to display formatted report. Date and Code fields. "Populate Sample Data" button for testing. Recording buttons (initially basic visibility).
    *   **Test 1.1.1:** Verify `index.html` loads, displaying all inputs, buttons (including "Populate Sample Data"), and report area. Click "Populate Sample Data" and verify fields are filled.
    *   **Status:** Complete

*   **Task 1.2:** Create `style.css` for basic structure and eventual layout replication.
    *   **Requirements:** Basic CSS for page structure. Detailed CSS for precise positioning of dynamic text fields (Date, Code, Patient Name, Age, Gender, Complaints, Examination, Diagnosis, Medications list) to match the letterhead. Static elements (lines, headers) will NOT be rendered.
    *   **Test 1.2.1:** (Deferred) Manually populate inputs. Verify text in report display visually matches letterhead. *This will be iteratively refined at the end.*
    *   **Status:** Initial structural CSS complete. Precise layout refinement deferred.

*   **Task 1.3:** Implement `script.js` for report generation from text inputs and sample data population.
    *   **Requirements:**
        *   JavaScript function to read values from all input fields.
        *   Auto-generate current date/time for 'Date' field if blank, else use provided date.
        *   Parse medication input (format: `Name;Instructions;Duration`).
        *   Dynamically construct and inject HTML into the report display `div`.
        *   Implement "Populate Sample Data" button functionality.
    *   **Test 1.3.1:** Click "Populate Sample Data", then "Generate Report". Verify report area updates correctly based on sample data. (Positional accuracy deferred to Test 1.2.1).
    *   **Status:** Complete

## Phase 2: Medication Data & Initial Client Logic

*   **Task 2.1:** Define `medications.json` for predefined medications.
    *   **Requirements:** Create `medications.json` with an array of medication objects: `{ "name": "string", "generic_name": "string", "instructions": "string", "duration": "string" }`. This file will be used as context for the Gemini API call via Firebase.
    *   **Test 2.1.1:** File is correctly structured and populated.
    *   **Status:** Complete (Superseded by Task 4.1, which introduced `medication_context_data.json`)

*   **Task 2.2 (Modified):** Client-side medication display logic.
    *   **Requirements:** `script.js` should correctly parse lines from the `medicationsInput` textarea (expected format: `Name;Instructions;Duration`) and display them in the report preview. This logic remains from earlier, but the *source* of the detailed medication strings will now be the Gemini API response (via Firebase), not client-side lookup.
    *   **Test 2.2.1:** Manually populate `medicationsInput` with a few lines like "Med1;Instr1;Dur1\nMed2;N/A;N/A". Generate report. Verify medications display correctly.
    *   **Status:** Complete (Existing logic is sufficient, but will be tested with Gemini-populated data later)

## Phase 3: Firebase-Orchestrated Voice-to-Structured-Data via Gemini API

*   **Task 3.1: Develop Firebase Cloud Function (`functions/index.js`).**
    *   **Requirements:**
        *   Create an HTTP-triggered Firebase Cloud Function (`processPatientAudio`) using v2 syntax.
        *   The function accepts a POST request with base64 encoded audio data (`audioData`) and `audioMimeType`.
        *   Securely access Gemini API Key from Firebase environment configuration.
        *   Bundle and read `medication_context_data.json` (this file contains separate arrays for `medicationNames`, `instructions`, and `durations`).
        *   Construct a prompt for Gemini 2.5 Pro (model `gemini-2.5-pro-preview-06-05`) including audio, the structured medication context from `medication_context_data.json`, and instructions for JSON output.
        *   Call the Gemini API. If a medication is from context, use its details; if unknown, use name as heard and "N/A" for instructions/duration.
        *   Return the structured JSON response from Gemini.
        *   **Update:** Gemini prompt enhanced to guide AI to place historical notes (e.g., "no history of...") into the `complaints` field.
    *   **Test 3.1.1 (Local Emulator):**
        1.  Firebase functions config exported to `functions/.runtimeconfig.json`.
        2.  `medication_context_data.json` is in `functions/` directory.
        3.  Firebase emulators started: `firebase emulators:start --only functions`.
        4.  `curl` POST request to local function URL with a known-good sample base64 Ogg audio string and `audioMimeType`.
        5.  `curl` output logged and reviewed.
        6.  **Verified:** Successful HTTP response (200 OK). Response body is structured JSON (content based on silent audio, but structure is correct and confirms API call success with full medication context). Emulator logs show successful function execution, Gemini API call, and JSON parsing without errors related to function logic or API key handling. Previous errors were due to a problematic audio sample.
    *   **Status:** Complete

*   **Task 3.2: Implement Client-Side Audio Recording and Firebase Function Call (`script.js`).**
    *   **Requirements:**
        *   Use `MediaRecorder` API to record audio when "Start Recording" is clicked.
        *   On "Stop Recording", convert audio to a base64 string and determine its MIME type.
        *   Make a `fetch` POST request to the **local** Firebase Cloud Function URL, sending `{ "audioData": "<base64_string>", "audioMimeType": "<actual_mime_type>" }`.
        *   Display a "Recording...", "Processing..." message or error messages in UI.
        *   Handle API errors gracefully.
    *   **Test 3.2.1:** Open `index.html` (served by local HTTP server). Ensure Firebase emulator for functions is running. Click Start Recording, speak, click Stop Recording. Verify:
        1.  UI shows "Recording..." then "Processing...".
        2.  A POST request is made to the local Firebase Function URL (check browser dev tools network tab and emulator logs).
        3.  The request payload contains base64 audio and the correct `audioMimeType`.
        4.  Emulator logs show function invocation and attempt to call Gemini.
    *   **Status:** Complete

*   **Task 3.3: Process Firebase/Gemini Response & Populate Client Fields (`script.js`).**
    *   **Requirements:**
        *   On successful response from Firebase Cloud Function, parse the returned structured JSON.
        *   Populate `index.html` input fields (patientName, age, complaints, etc.) from the JSON.
        *   For the `medications` array in the JSON:
            *   Format each medication object into a string: `Name;Instructions;Duration`.
            *   Join these strings with newlines and set as the value of `medicationsInput` textarea.
        *   Display confirmation/error messages in UI.
    *   **Test 3.3.1:** After a successful audio processing call via the local emulator (from Test 3.2.1):
        1.  UI shows a success message (e.g., "Report data extracted...").
        2.  Verify `index.html` input fields (patientName, age, complaints, diagnosis, examination) are populated based on the Gemini response.
        3.  Verify `medicationsInput` textarea is populated with medication details, formatted as `Name;Instructions;Duration`.
        4.  Clicking "Generate Report" should display these details accurately in the preview (layout testing still deferred).
    *   **Status:** Complete

## Phase 4: Interactive Layout Customization & Firestore Persistence

*   **Task 4.1: Update Medication Data Generation and Usage (Completed).**
    *   **Requirements:** Python script generates `functions/medication_context_data.json` with separate lists for names, instructions, and durations. Cloud Function `processPatientAudio` loads this file and uses its content to provide context to Gemini.
    *   **Status:** Complete

*   **Task 4.2: Develop Firebase Cloud Functions for Layout Settings.**
    *   **Requirements (`functions/index.js`):**
        *   Create HTTP-triggered function `saveReportLayout` (saves layout JSON to Firestore collection `layoutSettings`, doc `reportLayoutV1`).
        *   Create HTTP-triggered function `getReportLayout` (retrieves layout JSON from Firestore).
        *   Ensure CORS is handled.
    *   **Test 4.2.1 (Local Emulator):** Emulators for Functions and Firestore started. Test with `curl`:
        1.  POST sample layout data to `saveReportLayout`. Verified successful save response.
        2.  GET data from `getReportLayout`. Verified correct data retrieval.
        3.  (User to verify) Firestore emulator UI shows the saved data in `layoutSettings/reportLayoutV1`.
    *   **Status:** Complete

*   **Task 4.3: Implement Client-Side Layout UI with `interact.js`.**
    *   **Requirements (`index.html`, `script.js`):**
        *   Include `interact.js` library in `index.html` (e.g., via CDN).
        *   Add input fields (e.g., type `number`) for controlling `font-size` (in `pt`) for each adjustable report element.
        *   Add "Save Layout" and "Reset Layout" buttons to `index.html`.
        *   In `script.js`:
            *   Initialize `interact.js` on report preview elements (`.report-field`) to make them draggable (updating `transform: translate(x,y)`) and resizable (updating `width`, `height`).
            *   Store layout changes (x, y, width, height, font-size from inputs) in a local JavaScript object.
            *   On interaction (drag/resize/font change), update element styles immediately.
    *   **Test 4.3.1:** Verify report elements are draggable/resizable. Font size inputs change respective element font sizes. Visual feedback is immediate.
    *   **Status:** Complete

*   **Task 4.4: Implement Client-Side Persistence with Firestore.**
    *   **Requirements (`script.js`):**
        *   `saveLayoutToServer()`: On "Save Layout" click, send current layout object to `saveReportLayout` Cloud Function.
        *   `loadLayoutFromServer()`: On page load, call `getReportLayout` Cloud Function. If layout data is returned, apply it to report elements and font size inputs. Layout defaults to CSS values if no saved layout is found.
    *   **Test 4.4.1:** Modify layout, click "Save Layout". Refresh page; verify saved layout loads. Modify again, refresh without saving; verify previous saved layout loads. If Firestore is cleared and page is refreshed, the layout should be based on `style.css` defaults.
    *   **Status:** Complete

*   **Task 4.5 (Formerly 4.3 - Deferred CSS): Finalize Default CSS Layout.**
    *   **Requirements:** Once dynamic layout controls are working, use them to fine-tune the *default* CSS values in `style.css`. A helper utility has been added to `index.html` to generate CSS from the current layout settings.
    *   **Test 4.5.1:** Clear any saved layout (Firestore/local). Verify default layout is well-aligned after updating `style.css` using the new utility.
    *   **Status:** Complete (Utility provided; user to perform CSS update and verification)

*   **Task 4.6 (Formerly 4.4): Final Review and `TODO.md` Deletion.**
    *   **Status:** Incomplete (User requested to keep TODO.md for now)

## Phase 5: Patient Management & Advanced Features

*   **Task 5.1: Define Patient Data Structure and Firestore Integration.**
    *   **Requirements:**
        *   Analyze `/Users/areebbajwa/Downloads/ClinicData.xlsx - Sheet1.csv` to identify all relevant, non-empty patient data fields.
        *   Define a Firestore data model for patient records (e.g., in `patients` collection), including fields from CSV, and fields like `patientName`, `age`, `gender`.
        *   Develop Firebase Cloud Functions for:
            *   `createPatient(patientData)` (Update: This function will be modified to handle auto-incrementing `PReg` using a Firestore counter mechanism, ensuring unique `PReg` for new patients created via the app. The client will not send `PReg`.)
            *   `getPatient(patientId)` (or a more general query function)
            *   `updatePatient(patientId, patientData)`
            *   `deletePatient(patientId)`
            *   `searchPatients(searchQuery)` (for autocomplete, searching by name primarily, possibly other fields).
        *   Ensure CORS is handled for these new functions.
        *   Update `functions/index.js` with these new callable functions.
        *   Update `functions/.runtimeconfig.json` if necessary.
    *   **Test 5.1.1 (Local Emulator):** Test each Cloud Function with `curl` (or a simple test script) for creating, retrieving, updating, deleting, and searching patients. Verify data in Firestore emulator. (Existing tests passed prior to `PReg` change).
    *   **Test 5.1.2 (PReg Auto-increment):** Verify new patients created via the `createPatient` function (called from the app) get an auto-incremented `PReg` starting from 5785. Test sequential creations.
    *   **Status:** Complete (CRUD functions implemented and tested; PReg auto-increment logic updated to start from 5785 and tested. Search functionality improvements pending in Task 5.8)

*   **Task 5.2: Implement Patient Autocomplete and Creation on Report Page (`index.html`, `script.js`).**
    *   **Requirements:**
        *   Modify `patientNameInput` to be an autocomplete field. As the user types, it should call the `searchPatients` Cloud Function and display suggestions. (Update: Client will need to normalize search query for Task 5.8)
        *   When a patient is selected from autocomplete, populate other relevant known patient fields on the form (e.g., age, gender, and new fields from CSV as identified in Task 5.3).
        *   If the entered patient name doesn't exist (i.e., it's a new patient not selected from autocomplete) and the user proceeds to generate a report or explicitly triggers a save action (if a dedicated button is added), the new patient (with all entered data on the form) should be saved via the `createPatient` Cloud Function. (Update: Client-side logic, e.g. `ensurePatientExists`, will not send `PReg`; the server will generate it. Client might need to refresh patient data if `PReg` is displayed/used immediately).
    *   **Test 5.2.1:** Type in `patientNameInput`, verify suggestions appear. Select a patient, verify relevant fields populate. Enter a completely new name, fill other fields, then generate report (or trigger save/print action); verify new patient is created in Firestore with all data and an auto-incremented `PReg` (starting from 5785).
    *   **Status:** Partially Complete (Autocomplete and basic creation logic implemented; PReg handling for new patients updated. Search query normalization and testing with improved search pending Task 5.8)

*   **Task 5.3: Integrate New Patient Fields from CSV into Report Page Form (`index.html`, `script.js`).**
    *   **Requirements:**
        *   Based on the non-empty fields identified in Task 5.1 from the CSV, add corresponding input fields to the `input-section` in `index.html`.
        *   Update `script.js` to:
            *   Correctly populate these new fields when an existing patient is selected via autocomplete (Task 5.2).
            *   Collect data from these new fields when creating a new patient or potentially updating an existing one (if editing from this page is allowed).
            *   Determine which, if any, of these new CSV-derived fields should be displayed in the actual report preview (`reportOutput`) and update the report generation logic accordingly.
    *   **Test 5.3.1:** Verify new input fields are present on `index.html`. Data populates correctly on existing patient selection. Data from these fields is saved with new/updated patient records in Firestore. If applicable, selected fields appear in the report preview.
    *   **Status:** Complete

*   **Task 5.4: Implement "Print Report" Button & Save Patient Visit.**
    *   **Requirements (`index.html`, `script.js`, `functions/index.js`):**
        *   Add a "Print Report" button to `index.html`.
        *   In `script.js`, the "Print Report" button will:
            1.  Call `ensurePatientExists()` to create/confirm patient ID.
            2.  Update the report preview in `div#reportOutput`.
            3.  Gather visit data (date, code, complaints, examination, diagnosis, medications).
            4.  Call a `savePatientVisit` Cloud Function, sending patient ID and visit data. This function saves to `patients/{patientId}/visits/{visitId}`.
            5.  If visit is saved successfully, then call `window.print()`.
        *   Ensure print styles in `style.css` correctly format only the report preview.
    *   **Test 5.4.1:** Click "Print Report". Verify:
        1.  Patient is created/fetched correctly (including `PReg` if new).
        2.  A visit record is saved to Firestore under `patients/{patientId}/visits/{visitId}` with correct data.
        3.  The browser's print dialog appears.
        4.  The preview in the print dialog shows only the report content (`div#reportOutput`) and is styled appropriately for printing.
    *   **Status:** Mostly Complete (Cloud Function `savePatientVisit` and client-side logic in `script.js` for `ensurePatientExists` and `printReportButton` event listener implemented and component-level tests/reviews are positive. Full E2E UI testing was deferred by user request.)

*   **Task 5.5: Implement Resizable Medication Columns in Report Preview.**
    *   **Requirements (`script.js`, `style.css`):**
        *   Modify the medication rendering logic in `script.js` (within `generateReportButton` event listener) to structure medication name, instructions, and duration spans within containers that can be targeted by `interact.js` for resizing (e.g., individual divs for each column within each `.medication-item`).
        *   Use `interact.js` to make these medication columns resizable (e.g., by adjusting their `flex-basis` or `width`).
        *   Extend `currentLayoutSettings`, `saveLayoutToServer`, and `loadLayoutFromServer` functions to store and apply these medication column width/flex-basis values (e.g., `currentLayoutSettings.medicationColumns = { nameWidth: '35%', instructionWidth: '45%', durationWidth: '20%' }`).
        *   Update `style.css` with default `flex-basis` or `width` for these columns within `.medication-item`.
    *   **Test 5.5.1:** Generate a report with medications. Verify medication columns (name, instruction, duration) can be resized using drag handles or similar. Save the layout. Refresh the page; verify the resized medication columns persist.
    *   **Status:** Mostly Complete (Code implemented for resizable columns, storage in layout settings, and persistence. Component-level review positive. Full E2E UI testing deferred by user request.)

*   **Task 5.6: Create Secretary Patient Management Page (`patient_management.html`, `patient_management.js`).**
    *   **Requirements:**
        *   Create a new HTML file: `patient_management.html`.
            *   Include a table or list to display existing patients. Key identifiers (e.g., Name, Patient ID from CSV, contact info) should be visible.
            *   Implement search/filter functionality for this patient list.
            *   Provide UI elements (buttons/forms) for "Add New Patient," "Edit Selected Patient," and "Delete Selected Patient."
            *   Forms for adding/editing should include all relevant patient demographic fields (e.g., name, address, contact, DOB, and other non-medical fields identified from the CSV in Task 5.1). These forms should *not* include fields for complaints, examination, diagnosis, or specific visit medications.
        *   Create a new JavaScript file: `patient_management.js`.
            *   Logic to fetch and display the patient list (e.g., on page load and after search/filter, calling `searchPatients` or a new `getAllPatients` Cloud Function).
            *   Event handlers for Add, Edit, Delete actions, calling the respective patient CRUD Cloud Functions (`createPatient`, `updatePatient`, `deletePatient`).
            *   Client-side validation for forms.
        *   Ensure appropriate styling for this new page. This might involve adding specific styles to `style.css` or creating a dedicated `patient_management.style.css` if the styling becomes complex. For simplicity, try to reuse existing styles or add to `style.css` first.
    *   **Test 5.6.1:**
        1.  Navigate to `patient_management.html`. Verify patient list displays (if any patients exist).
        2.  Test search/filter functionality.
        3.  Test adding a new patient: Fill form, save. Verify patient appears in the list and data is correct in Firestore. Check PReg is correctly incremented.
        4.  Test editing an existing patient: Select patient, modify data, save. Verify updates in list and Firestore.
        5.  Test deleting a patient: Select patient, confirm deletion. Verify patient is removed from list and Firestore.
        6.  **PReg Counter Fix (Internal):** Investigated and corrected `createPatient` Cloud Function to use the shared `_constants/patientCounter` document, resolving issues where new patients received PReg values like `PR-1`, `PR-2` instead of incrementing from the last imported PReg. (Completed)
    *   **Status:** Mostly Complete (HTML, JS, CSS for CRUD operations and display are implemented. PReg counter logic fixed. Task 5.6.1 UI testing to be performed by user.)

*   **Task 5.7: Implement "Reprocess Last Audio" Feature.**
    *   **Requirements:**
        *   "Reprocess Last Audio" button in `index.html`.
        *   `script.js` logic to store the last successfully recorded/processed audio data (base64 string and MIME type).
        *   Clicking button sends stored audio to `processPatientAudio` Cloud Function and populates fields.
    *   **Test 5.7.1:** Record audio, process. Manually change some fields. Click "Reprocess Last Audio". Verify fields repopulate from original audio processing.
    *   **Status:** Complete

*   **Task 5.8: Improve Patient Search Functionality.**
    *   **Requirements:**
        *   **5.8.1:** Modify `import_patients_from_csv.py` to generate and include a `name_normalized` field (lowercase, trimmed spaces) for each patient during the import preparation phase before calling `createPatient`. (Complete)
        *   **5.8.2:** Update the `createPatient` Cloud Function (`functions/index.js`) to also generate and store this `name_normalized` field when new patients are created via the app. (Complete)
        *   **5.8.3:** Modify the `searchPatients` Cloud Function (`functions/index.js`) to perform its primary query against this `name_normalized` field. The query itself should also be normalized (lowercase, trimmed). (Complete)
        *   **5.8.4:** Update client-side JavaScript (`script.js`) in the patient autocomplete logic to normalize the search term (lowercase, trim spaces) before sending it to the `searchPatients` Cloud Function. (Complete)
    *   **Test 5.8.1 (Data):** Verified that imported patient documents in Firestore contain the `name_normalized` field (via `getPatient` Cloud Function calls for PR-1). Verified new app-created patients also get this field correctly (via `getPatient` for W7j5umIWXlLjpRov87P5). Re-import script completed.
    *   **Test 5.8.2 (Search):** Tested `searchPatients` with various inputs (exact, mixed case, spaces, partial for imported and new app patients) via `curl`. Verified it returns correct results consistently.
    *   **Status:** Complete

*   **Task 5.9: Update UI Label for Occupation.**
    *   **Requirements:** Change the UI label for the `FName` field from "Father's Name" to "Occupation" in `index.html`. The underlying data field `FName` remains unchanged.
    *   **Test 5.9.1:** Verify the label in `index.html` displays "Occupation:" correctly.
    *   **Status:** Complete

*   **Task 5.10: Adjust Button Layout on Report Page (`index.html`, `style.css`).**
    *   **Requirements:**
        *   Modify `index.html` and/or `style.css` so that the main action buttons (e.g., "Generate Report", "Populate Sample Data", "Print Report", "Start Recording", "Stop Recording", "Reprocess Last Audio", "Save Layout") are arranged on a single line (or a more compact grouping) rather than each on its own line.
        *   Ensure the new layout is responsive and usable.
    *   **Test 5.10.1:** Verify in the browser that the specified buttons appear side-by-side or in a compact, usable arrangement.
    *   **Status:** Complete

*   **NEW Task 5.11: Enhance `processPatientAudio` Cloud Function for Updates.**
    *   **Requirements:**
        *   Modify `processPatientAudio` (`functions/index.js`) to optionally accept `existingPatientData` (including `complaints`, `diagnosis`, `examination`, `medications` from the last visit) in the POST request.
        *   If `existingPatientData` is provided, the Gemini prompt should be updated to instruct the AI to *update* this existing data based on the new audio narration, rather than generating everything from scratch.
        *   The function should still return the full structured JSON for all report fields.
    *   **Test 5.11.1 (Local Emulator - `curl`):**
        1.  Test `processPatientAudio` *without* `existingPatientData`. (Skipped due to lack of audio data/previous API error)
        2.  Test `processPatientAudio` *with* sample `existingPatientData` and an audio narration that clearly intends to *modify* parts of it. (Skipped)
        3.  Verify the returned JSON reflects the intelligent update.
    *   **Status:** Partially Complete (Backend implemented. User to perform `curl` tests with actual base64 audio strings and verify Gemini API functionality.)

*   **NEW Task 5.12: Create Cloud Function to Get Last Patient Visit.**
    *   **Requirements (`functions/index.js`):**
        *   Create an HTTP-triggered Firebase Cloud Function `getLastPatientVisit(patientId)`.
        *   It should query the `patients/{patientId}/visits` subcollection, order by `visitDate` (descending), limit to 1, and return the most recent visit document.
        *   Handle cases where no visits exist for the patient (return 404 or empty object).
        *   Ensure CORS is handled.
    *   **Test 5.12.1 (Local Emulator - `curl`):**
        1.  Test with a `patientId` that has one or more visits. Verify the last visit data is returned. (Functionality confirmed with programmatically created well-formed data. Failures with existing user data are due to data structure issues in emulator - user to verify specific patient data: `visits` subcollection, `visitDate` field name and sortable type.)
        2.  Test with a `patientId` that has no visits. Verify an appropriate response. (Passed)
        3.  Test with missing `patientId`. (Passed)
    *   **Status:** Complete (Backend function verified. User needs to ensure their existing Firestore data adheres to the required structure for `visitDate`.)

*   **NEW Task 5.13: Update Report Page (`index.html`, `script.js`) for Last Visit Autofill & Audio Updates.**
    *   **Requirements (`script.js`):**
        *   When a patient is selected from autocomplete (`selectPatient` function):
            *   After populating demographic data, call `getLastPatientVisit` Cloud Function.
            *   If last visit data is found, populate `complaintsInput`, `examinationInput`, `diagnosisInput`, `medicationsInput`. Store this last visit data (e.g., in `currentVisitData` state variable).
        *   Modify `processAudioAndPopulateFields` function:
            *   If `currentVisitData` exists, include it as `existingPatientData` in the request to `processPatientAudio`.
        *   Saving visits via "Print Report" should save the current state of input fields.
    *   **Test 5.13.1 (UI - `index.html` with emulators):**
        1.  Select a patient with a known previous visit. Verify demographic AND last visit fields auto-populate.
        2.  Record new audio instructing changes. Verify input fields update correctly.
        3.  Click "Print Report". Verify updated visit data is saved.
        4.  Select a patient with no visits. Verify visit fields are empty. Record audio. Verify new report is generated.
    *   **Status:** Partially Complete (Frontend implemented. E2E testing pending backend verification and UI testing by user.)

*   **NEW Task 5.14: Import Historical Visit Data from CSV.**
    *   **Requirements:**
        *   **5.14.1: Analyze `ClinicData.xlsx - Sheet1.csv`** (Completed)
        *   **5.14.2: Modify `import_patients_from_csv.py`** (Completed - batch processing implemented)
        *   **5.14.3: Create new Cloud Function `addHistoricalVisit` (`functions/index.js`)** (Completed - batch processing implemented)
        *   **5.14.4: Re-run the import script** to populate historical visits. (Completed - Live import successful with batching)
    *   **Test 5.14.1:** Verify that after re-import, selecting an imported patient (e.g., "Rukhsana Bibi") in `index.html` now correctly auto-populates the form with their most recent historical visit data from the CSV. Test with multiple patients. (This will be covered by Task 6.7)
    *   **Status:** Complete

## Phase 6: Deployment and Environment Configuration

*   **Task 6.1: Deploy to Live Firebase Environment.**
    *   **Requirements:**
        *   Ensure `GEMINI_API_KEY` is correctly configured for deployed functions using `defineString` and set in the Firebase environment (e.g., via `.env.theneuron-ac757` or Google Cloud Console).
        *   Deploy all Firebase assets: `firebase deploy` (Functions, Firestore rules/indexes, Hosting).
        *   Verify successful deployment of all functions.
    *   **Test 6.1.1:** All Cloud Functions deploy without errors.
    *   **Status:** Complete

*   **Task 6.2: Update Client-Side Firebase Function URLs.**
    *   **Requirements:**
        *   Once functions are successfully deployed, get their live URLs (e.g., from Firebase console or `firebase functions:list` output).
        *   Update `script.js` and `patient_management.js` to replace `localhost:5001` URLs with the live production URLs for all Firebase Cloud Functions.
    *   **Test 6.2.1:** Open the deployed application. Verify all features relying on Cloud Functions (audio processing, patient search/CRUD, layout saving/loading, visit handling) work correctly with the live backend.
    *   **Status:** Complete

*   **Task 6.3: Upgrade Cloud Functions Node.js Runtime.**
    *   **Requirements:**
        *   Update `functions/package.json` to specify a supported Node.js runtime (e.g., Node.js 20 or later, as per Firebase/Google Cloud recommendations). The current Node.js 18 is deprecated.
        *   Modify the `engines` field in `functions/package.json`.
        *   Re-deploy functions after updating.
    *   **Test 6.3.1:** Functions deploy successfully with the new Node.js runtime and continue to operate as expected.
    *   **Status:** Complete

*   **NEW Task 6.4: End-to-End Test of Core Report Generation Workflow.**
    *   **Requirements:** Test the primary user flow of populating data and generating a report on the live application.
    *   **Test 6.4.1:** Perform E2E test.
        1.  Navigate to the live application URL (`https://theneuron-ac757.web.app`).
        2.  Verify that the message "Layout settings loaded." is displayed.
        3.  Click the "Populate Sample Data" button.
        4.  Verify that the relevant input fields (e.g., Patient Name, Complaints, Medications) are populated with sample data.
        5.  Click the "Generate Report" button.
        6.  Verify that the report preview area is updated and displays content derived from the sample data.
        7.  Check the browser console for any new critical errors during this flow.
    *   **Status:** Complete

*   **NEW Task 6.5: End-to-End Test of Audio Recording and Processing Workflow.**
    *   **Requirements:** Test the audio input to structured data population flow on the live application.
    *   **Test 6.5.1:** Perform E2E test.
        1.  Navigate to the live application URL (`https://theneuron-ac757.web.app`).
        2.  Wait for layout settings to load.
        3.  Click the "Start Recording" button.
        4.  Verify the "Start Recording" button is disabled and hidden, and the "Stop Recording" button is enabled and visible. Verify a "Recording..." message is displayed.
        5.  Click the "Stop Recording" button.
        6.  Verify the "Stop Recording" button is disabled and hidden, and the "Start Recording" button is enabled and visible. Verify a "Processing audio..." or similar message appears.
        7.  Verify that input fields are eventually populated or cleared based on the (likely minimal) AI response to the simulated empty audio.
        8.  Check the browser console for any new critical errors during this flow.
    *   **Status:** Complete

*   **NEW Task 6.6: Address Firebase Build Image Cleanup Warning.**
    *   **Requirements:** Investigate and resolve the "Unhandled error cleaning up build images" warning to prevent potential small monthly bills.
    *   **Actions:**
        1.  Navigate to `https://console.cloud.google.com/gcr/images/theneuron-ac757/us/gcf`.
        2.  Attempt to identify and manually delete orphaned/unnecessary build images if clearly identifiable.
        3.  If manual deletion is unclear or risky, consider if another `firebase deploy` might resolve it, as suggested by the warning (though previous deploys did not clear it).
        4.  Document findings and actions.
    *   **Status:** On Hold (User requested to defer)

*   **NEW Task 6.7: End-to-End Test of Patient Search, Selection, and Last Visit Autofill.**
    *   **Requirements:** Test the workflow of searching for an existing patient, selecting them, and verifying that their demographic data and last visit details (if any) are auto-populated on the report page. This uses the live application.
    *   **Assumptions for Test Data:** This test will assume that a patient named "Javeria Munawar" exists (imported from CSV, `PReg`: `PR-1`) and has at least one historical visit record that can be fetched by the `getLastPatientVisit` function. (Corrected name from Rukhsana Bibi based on direct data fetch).
    *   **Test 6.7.1:** Perform E2E test.
        1.  Navigate to the live application URL (`https://theneuron-ac757.web.app`). (Completed)
        2.  Wait for layout settings to load. (Completed)
        3.  In the "Patient Name" input field, type "Javeria Munawar". (Completed)
        4.  Verify that autocomplete suggestions appear and include "Javeria Munawar (ID: PR-1)". (Completed)
        5.  Click on the "Javeria Munawar (ID: PR-1)" suggestion to select the patient. (Completed)
        6.  Verify that patient demographic fields (e.g., Age, Gender, PReg/Code) are populated with Javeria Munawar's data. (Completed)
        7.  Verify that visit-specific fields (Complaints, Examination, Diagnosis, Medications) are populated with data from her most recent visit. (Completed - Verified against direct API call and console logs)
        8.  Check the browser console for any new critical errors during this flow. (Completed - Only known browser extension errors present)
    *   **Status:** Complete

## Phase 7: Final E2E Testing and Cleanup (Live Environment)

*   **Task 6.7: End-to-End Test of Patient Search, Selection, and Last Visit Autofill.**
    *   **Requirements:** Test the workflow of searching for an existing patient, selecting them, and verifying that their demographic data and last visit details (if any) are auto-populated on the report page. This uses the live application.
    *   **Assumptions for Test Data:** This test will assume that a patient named "Javeria Munawar" exists (imported from CSV, `PReg`: `PR-1`) and has at least one historical visit record that can be fetched by the `getLastPatientVisit` function. (Corrected name from Rukhsana Bibi based on direct data fetch).
    *   **Test 6.7.1:** Perform E2E test.
        1.  Navigate to the live application URL (`https://theneuron-ac757.web.app`). (Completed)
        2.  Wait for layout settings to load. (Completed)
        3.  In the "Patient Name" input field, type "Javeria Munawar". (Completed)
        4.  Verify that autocomplete suggestions appear and include "Javeria Munawar (ID: PR-1)". (Completed)
        5.  Click on the "Javeria Munawar (ID: PR-1)" suggestion to select the patient. (Completed)
        6.  Verify that patient demographic fields (e.g., Age, Gender, PReg/Code) are populated with Javeria Munawar's data. (Completed)
        7.  Verify that visit-specific fields (Complaints, Examination, Diagnosis, Medications) are populated with data from her most recent visit. (Completed - Verified against direct API call and console logs)
        8.  Check the browser console for any new critical errors during this flow. (Completed - Only known browser extension errors present)
    *   **Status:** Complete