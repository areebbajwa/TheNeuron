document.addEventListener('DOMContentLoaded', async () => {
    // --- Get DOM Elements (Declare once) ---
    const generateReportButton = document.getElementById('generateReportButton');
    const populateSampleDataButton = document.getElementById('populateSampleDataButton');
    const startRecordingButton = document.getElementById('startRecordingButton');
    const stopRecordingButton = document.getElementById('stopRecordingButton');
    const reprocessAudioButton = document.getElementById('reprocessAudioButton');
    const transcriptionOutputDiv = document.getElementById('transcriptionOutput');
    const patientNameInput = document.getElementById('patientName');
    const patientNameSuggestionsDiv = document.getElementById('patientNameSuggestions');
    const ageInput = document.getElementById('age');
    const genderInput = document.getElementById('gender');
    const contactNoInput = document.getElementById('contactNo');
    const nicNoInput = document.getElementById('nicNo');
    const fatherNameInput = document.getElementById('fatherName');
    const addressInput = document.getElementById('address');
    const reportDateInput = document.getElementById('reportDate');
    const reportCodeInput = document.getElementById('reportCode');
    const complaintsInput = document.getElementById('complaints');
    const examinationInput = document.getElementById('examination');
    const diagnosisInput = document.getElementById('diagnosis');
    const medicationsInput = document.getElementById('medicationsInput');
    const printReportButton = document.getElementById('printReportButton');

    // New buttons for visit management (Task 8.3)
    const clearVisitFieldsButton = document.getElementById('clearVisitFieldsButton');
    const prevVisitButton = document.getElementById('prevVisitButton');
    const nextVisitButton = document.getElementById('nextVisitButton');

    // Layout control elements
    const fontSizeControlsContainer = document.getElementById('font-size-controls-container');
    const saveLayoutButton = document.getElementById('saveLayoutButton');
    const reportOutputContainer = document.getElementById('reportOutput'); // The preview area
    const generateCssButton = document.getElementById('generateCssButton');
    const generatedCssOutput = document.getElementById('generatedCssOutput');

    // --- State Variables ---
    let mediaRecorder;
    let audioChunks = [];
    let recordedAudioMimeType = null;
    let lastRecordedBase64AudioData = null;
    let lastRecordedMimeType = null;
    let currentLayoutSettings = { // To store { elementId: { x, y, width, height, fontSize } }
        medicationColWidths: { // Default widths for medication columns
            name: '30%',
            instructions: '45%',
            duration: '25%'
        }
    };
    let currentPatientId = null;
    let currentLastVisitData = null; // NEW: To store the last fetched visit data
    const reportFieldElements = Array.from(document.querySelectorAll('.report-field'));

    // New state for visit navigation (Task 8.3)
    let patientVisitHistory = []; // To store all visits of the selected patient
    let currentVisitHistoryIndex = -1; // Index of the currently displayed visit in patientVisitHistory

    // --- Firebase Cloud Function URLs ---
    const useEmulator = false; // <--- SET TO true FOR EMULATOR, false FOR PRODUCTION

    const prodProjectId = "theneuron-ac757";
    const prodRegion = "us-central1"; // Or your specific region if different for prod
    const prodBaseUrl = `https://${prodRegion}-${prodProjectId}.cloudfunctions.net`; // Common pattern for v1/v2 HTTP functions if not using custom domain
    // Alternative for prod if functions have unique hostnames (e.g. from Cloud Run v2 integration):
    // const prodProcessAudioFunctionUrl = "https://processpatientaudio-pzytr7bzwa-uc.a.run.app"; 

    const localProjectId = "theneuron-ac757";
    const localRegion = "us-central1";
    const localBaseUrl = "http://localhost:5002/theneuron-ac757/us-central1";

    let baseUrl = useEmulator ? localBaseUrl : prodBaseUrl;

    // For production, ensure these paths match your deployed function names if they differ from local
    // Or, if using unique hostnames per function in production (like Cloud Run v2), define them fully.
    const processAudioFunctionUrl = useEmulator ? `${localBaseUrl}/processPatientAudio` : "https://processpatientaudio-pzytr7bzwa-uc.a.run.app";
    const saveLayoutFunctionUrl = useEmulator ? `${localBaseUrl}/saveReportLayout` : "https://savereportlayout-pzytr7bzwa-uc.a.run.app";
    const getLayoutFunctionUrl = useEmulator ? `${localBaseUrl}/getReportLayout` : "https://getreportlayout-pzytr7bzwa-uc.a.run.app";
    const searchPatientsFunctionUrl = useEmulator ? `${localBaseUrl}/searchPatients` : "https://searchpatients-pzytr7bzwa-uc.a.run.app";
    const createPatientFunctionUrl = useEmulator ? `${localBaseUrl}/createPatient` : "https://createpatient-pzytr7bzwa-uc.a.run.app";
    const getPatientFunctionUrl = useEmulator ? `${localBaseUrl}/getPatient` : "https://getpatient-pzytr7bzwa-uc.a.run.app";
    const savePatientVisitFunctionUrl = useEmulator ? `${localBaseUrl}/savePatientVisit` : "https://savepatientvisit-pzytr7bzwa-uc.a.run.app";
    const getLastPatientVisitFunctionUrl = useEmulator ? `${localBaseUrl}/getLastPatientVisit` : "https://getlastpatientvisit-pzytr7bzwa-uc.a.run.app";
    const getAllPatientVisitsFunctionUrl = useEmulator ? `${localBaseUrl}/getAllPatientVisits` : "https://getallpatientvisits-pzytr7bzwa-uc.a.run.app";

    // --- Initialize & Load Data ---
    // (Existing medication loading logic - can be kept or removed if not used client-side anymore)
    // For now, keeping it, but it's not directly used by the layout or audio processing logic.
    // let predefinedMedications = []; // This was from an older phase, may not be needed client-side now.
    // try {
    //     const response = await fetch('medications.json'); // This might be old path or no longer needed
    //     if (response.ok) {
    //         predefinedMedications = await response.json(); 
    //         console.log("Legacy medications.json loaded (if present):", predefinedMedications.length);
    //     } else {
    //         console.warn('Legacy medications.json not found or failed to load.');
    //     }
    // } catch (error) {
    //     console.warn('Error fetching legacy medications.json:', error);
    // }

    // --- Sample Data & Populate Button (Existing) ---
    const sampleData = {
        patientName: "Mrs Rana Shahid",
        age: "38 Year(s)",
        gender: "Female",
        contactNo: "03001234567",
        nicNo: "12345-1234567-1",
        fatherName: "Mr. Shahid",
        address: "123 Sample Street, Sample City",
        reportDate: "21/04/2025 04:39:06 PM",
        reportCode: "776662 / PR-1552",
        complaints: `Headache\nNeck pain\nBL shoulder pain\nDisturbed sleep\nx 3 days\nNot a known Hypertensive`,
        examination: "No Neurological Deficit B.P 130/85",
        diagnosis: `TH\nHTN`,
        medicationsInput: `Tab SL Gan 1mg\nTab Dioplus 5/80 mg\nTab Atcam 8 mg\nCap Cyno D 200000IU\nTab Ozip 5 mg\nTab HS Forte\nPanadol Extra`
    };
    if (populateSampleDataButton) {
        populateSampleDataButton.addEventListener('click', () => {
            patientNameInput.value = sampleData.patientName;
            ageInput.value = sampleData.age;
            genderInput.value = sampleData.gender;
            contactNoInput.value = sampleData.contactNo;
            nicNoInput.value = sampleData.nicNo;
            fatherNameInput.value = sampleData.fatherName;
            addressInput.value = sampleData.address;
            reportDateInput.value = sampleData.reportDate;
            reportCodeInput.value = sampleData.reportCode;
            complaintsInput.value = sampleData.complaints;
            examinationInput.value = sampleData.examination;
            diagnosisInput.value = sampleData.diagnosis;
            medicationsInput.value = sampleData.medicationsInput;
            
            currentPatientId = null; // Reset patient context
            currentLastVisitData = null; // Reset visit context
            patientVisitHistory = [];
            currentVisitHistoryIndex = -1;
            updateNavigationButtonsState();
            clearOnlyVisitSpecificFields(); // Clear visit fields as well
            if(transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'Sample data populated.';
        });
    }

    // --- Layout Customization Functions (Task 4.3 & 4.4) ---
    function applyLayoutSettings(settings) {
        reportFieldElements.forEach(el => {
            const id = el.id;
            const elSettings = settings[id];
            if (elSettings) {
                el.style.transform = `translate(${elSettings.x || 0}px, ${elSettings.y || 0}px)`;
                if (elSettings.width) el.style.width = `${elSettings.width}px`;
                if (elSettings.height) el.style.height = `${elSettings.height}px`;
                if (elSettings.fontSize) el.style.fontSize = `${elSettings.fontSize}pt`;

                // Update corresponding font size input if it exists
                const fontInput = document.getElementById(`font-${id}`);
                if (fontInput && elSettings.fontSize) fontInput.value = elSettings.fontSize;
            } else {
                // If no settings for this element, reset to CSS defaults (remove inline styles)
                el.style.transform = '';
                el.style.width = '';
                el.style.height = '';
                el.style.fontSize = '';
                const fontInput = document.getElementById(`font-${id}`);
                if (fontInput) {
                    const computedStyle = getComputedStyle(el);
                    fontInput.value = parseFloat(computedStyle.fontSize); // or a default
                }
            }
        });

        // Apply medication column widths if present in settings
        if (settings && settings.medicationColWidths) {
            currentLayoutSettings.medicationColWidths = { ...currentLayoutSettings.medicationColWidths, ...settings.medicationColWidths };
            // Note: Actual application to columns happens when they are rendered by updateReportPreview -> initializeMedicationColumnResizing
        } else if (!currentLayoutSettings.medicationColWidths) { // Ensure defaults if nothing in settings
             currentLayoutSettings.medicationColWidths = { name: '30%', instructions: '45%', duration: '25%' };
        }
        
        // Update local cache with all settings (including potentially merged medicationColWidths)
        currentLayoutSettings = { ...currentLayoutSettings, ...settings };


        // If medication items exist (e.g. sample data populated before layout load), apply widths
        const medNameCols = document.querySelectorAll('.medication-name-col');
        const medInstrCols = document.querySelectorAll('.medication-instr-col');
        const medDurCols = document.querySelectorAll('.medication-dur-col');

        if (currentLayoutSettings.medicationColWidths) {
            medNameCols.forEach(col => col.style.flexBasis = currentLayoutSettings.medicationColWidths.name);
            medInstrCols.forEach(col => col.style.flexBasis = currentLayoutSettings.medicationColWidths.instructions);
            medDurCols.forEach(col => col.style.flexBasis = currentLayoutSettings.medicationColWidths.duration);
        }
    }

    function getElementInitialStyles(element) {
        const computedStyle = getComputedStyle(element);
        const rect = element.getBoundingClientRect(); // Relative to viewport
        const parentRect = reportOutputContainer.getBoundingClientRect(); // Report preview area

        // Initial x, y are 0 because transform is relative to initial CSS position
        return {
            x: 0, 
            y: 0,
            // Use offsetWidth/Height for actual rendered dimensions if available and sensible
            width: element.offsetWidth, 
            height: element.offsetHeight,
            fontSize: parseFloat(computedStyle.fontSize) // Gets computed size in px, convert to pt if needed, or just use px
        };
    }

    function setupFontSizeControls() {
        if (!fontSizeControlsContainer) return;
        fontSizeControlsContainer.innerHTML = ''; // Clear existing
        reportFieldElements.forEach(el => {
            if (!el.id) {
                console.warn("Report field element missing ID, cannot create font control:", el);
                return;
            }
            const label = document.createElement('label');
            label.htmlFor = `font-${el.id}`;
            label.textContent = `${el.id.replace('report','').replace('Display','')}: `;
            
            const input = document.createElement('input');
            input.type = 'number';
            input.id = `font-${el.id}`;
            input.min = '6'; input.max = '72'; input.step = '1';
            
            const initialStyles = currentLayoutSettings[el.id] || getElementInitialStyles(el);
            input.value = initialStyles.fontSize || 10; // Default to 10pt if not found
            currentLayoutSettings[el.id] = { ...initialStyles, ...(currentLayoutSettings[el.id] || {}) }; // Ensure initialized

            input.addEventListener('change', (e) => {
                const newSize = parseFloat(e.target.value);
                if (!isNaN(newSize)) {
                    el.style.fontSize = `${newSize}pt`;
                    if (!currentLayoutSettings[el.id]) currentLayoutSettings[el.id] = getElementInitialStyles(el);
                    currentLayoutSettings[el.id].fontSize = newSize;
                }
            });
            fontSizeControlsContainer.appendChild(label);
            fontSizeControlsContainer.appendChild(input);
            fontSizeControlsContainer.appendChild(document.createElement('br'));
        });
    }

    function initializeInteractJs() {
        reportFieldElements.forEach(el => {
            if (!el.id) return;
            const initial = currentLayoutSettings[el.id] || getElementInitialStyles(el);
            // Store initial relative positions in data attributes if not already set by loaded settings
            // `interact.js` modifies transform, so x/y are relative to the element's original CSS position.
            let x = initial.x || 0;
            let y = initial.y || 0;
            el.style.transform = `translate(${x}px, ${y}px)`;
            if(initial.width) el.style.width = `${initial.width}px`;
            if(initial.height) el.style.height = `${initial.height}px`;

            interact(el)
                .draggable({
                    listeners: {
                        start(event) {
                            const rect = interact.getElementRect(event.target);
                            event.target.setAttribute('data-start-width', rect.width);
                            event.target.setAttribute('data-start-height', rect.height);
                        },
                        move(event) {
                            x += event.dx;
                            y += event.dy;
                            event.target.style.transform = `translate(${x}px, ${y}px)`;
                        },
                        end(event) {
                            if (!currentLayoutSettings[el.id]) currentLayoutSettings[el.id] = getElementInitialStyles(el);
                            currentLayoutSettings[el.id].x = x;
                            currentLayoutSettings[el.id].y = y;
                            console.log('Layout updated:', currentLayoutSettings);
                        }
                    },
                    modifiers: [
                        interact.modifiers.restrictRect({ restriction: 'parent' })
                    ]
                })
                .resizable({
                    edges: { top: true, left: true, bottom: true, right: true },
                    listeners: {
                        move(event) {
                            let target = event.target;
                            let newWidth = event.rect.width;
                            let newHeight = event.rect.height;

                            target.style.width = `${newWidth}px`;
                            target.style.height = `${newHeight}px`;
                            
                            // Adjust position for resizing from top/left edges
                            x += event.deltaRect.left;
                            y += event.deltaRect.top;
                            target.style.transform = `translate(${x}px, ${y}px)`;

                            // Update local state for saving
                            if (!currentLayoutSettings[target.id]) currentLayoutSettings[target.id] = getElementInitialStyles(target);
                            currentLayoutSettings[target.id].width = newWidth;
                            currentLayoutSettings[target.id].height = newHeight;
                            currentLayoutSettings[target.id].x = x; // x,y also change when resizing from top/left
                            currentLayoutSettings[target.id].y = y;
                        }
                    },
                    modifiers: [
                        interact.modifiers.restrictEdges({ outer: 'parent' }),
                        interact.modifiers.restrictSize({ min: { width: 20, height: 10 } })
                    ]
                });
        });
    }

    async function loadLayoutFromServer() {
        if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'Loading layout settings...';
        try {
            const response = await fetch(getLayoutFunctionUrl);
            if (!response.ok) {
                // For 404 (no layout found), it's not strictly an error, just use defaults.
                if (response.status === 404) {
                    if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'No saved layout found. Using defaults.';
                    console.log("No saved layout on server, using defaults."); // Replaced logger for client-side
                    applyLayoutSettings(currentLayoutSettings); // Apply defaults or current state
                    setupFontSizeControls(); // Still setup controls, possibly with default values
                    initializeInteractJs(); // Initialize interact.js here too
                    return;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            // Get response as text first
            const responseText = await response.text();
            // Remove trailing '%' if present and trim whitespace
            const cleanedText = responseText.replace(/%$/, '').trim(); 

            if (!cleanedText) { // Handle case where cleaned text might be empty
                 if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'Received empty layout data. Using defaults.';
                 console.warn("Received empty layout data from server."); // Replaced logger
                 applyLayoutSettings(currentLayoutSettings);
                 setupFontSizeControls();
                 initializeInteractJs();
                 return;
            }

            const data = JSON.parse(cleanedText); // Parse the cleaned text

            applyLayoutSettings(data);
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'Layout settings loaded.';
            console.log("Layout loaded from server:", data); // Replaced logger
        } catch (error) {
            console.error("Error loading layout from server:", error); // Replaced logger
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Error loading layout: ${error.message}. Using defaults.`;
            applyLayoutSettings(currentLayoutSettings); // Apply defaults or current state on error
        }
        // Ensure font size controls are set up regardless of load success,
        // using either loaded settings or defaults.
        setupFontSizeControls();
        initializeInteractJs(); // Initialize interact.js after applying settings
    }

    async function saveLayoutToServer() {
        if (!saveLayoutButton) return;
        saveLayoutButton.disabled = true;
        transcriptionOutputDiv.textContent = 'Saving layout...';
        try {
            // currentLayoutSettings already includes medicationColWidths if they've been set
            const response = await fetch(saveLayoutFunctionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(currentLayoutSettings), // This should now include medicationColWidths
            });
            if (response.ok) {
                transcriptionOutputDiv.textContent = 'Layout saved successfully.';
            } else {
                const err = await response.json().catch(() => ({ error: "Failed to save layout" }));
                throw new Error(err.error || response.statusText);
            }
        } catch (error) {
            console.error("Error saving layout to server:", error);
            transcriptionOutputDiv.textContent = `Error saving layout: ${error.message}`;
        } finally {
            saveLayoutButton.disabled = false;
        }
    }

    // Event listener for the save layout button
    if (saveLayoutButton) {
        saveLayoutButton.addEventListener('click', saveLayoutToServer);
    }

    // --- Patient Autocomplete Functions (Task 5.2) ---
    async function handlePatientNameInput() {
        const query = patientNameInput.value.trim().toLowerCase();
        if (query.length < 2) { // Start searching after 2 characters
            patientNameSuggestionsDiv.innerHTML = '';
            patientNameSuggestionsDiv.style.display = 'none';
            currentPatientId = null; // Reset if query is too short or cleared
            currentLastVisitData = null; // Reset visit data as well
            // Clear other patient-specific fields if name is cleared/too short
            clearPatientDemographicFields(false); // false = don't clear name itself
            clearOnlyVisitSpecificFields(); // Clear visit fields
            return;
        }

        try {
            const response = await fetch(`${searchPatientsFunctionUrl}?q=${encodeURIComponent(query)}&limit=5`);
            if (!response.ok) {
                console.error('Error searching patients:', response.statusText);
                patientNameSuggestionsDiv.innerHTML = '';
                patientNameSuggestionsDiv.style.display = 'none';
                return;
            }
            const patients = await response.json();
            displayPatientSuggestions(patients);
        } catch (error) {
            console.error('Error fetching patient suggestions:', error);
            patientNameSuggestionsDiv.innerHTML = '';
            patientNameSuggestionsDiv.style.display = 'none';
        }
    }

    function displayPatientSuggestions(patients) {
        patientNameSuggestionsDiv.innerHTML = '';
        if (patients.length === 0) {
            patientNameSuggestionsDiv.style.display = 'none';
            return;
        }

        const ul = document.createElement('ul');
        patients.forEach(patient => {
            const li = document.createElement('li');
            // Display more info if available, e.g., PReg or contact number for disambiguation
            let displayText = patient.name;
            if (patient.pReg) displayText += ` (ID: ${patient.pReg})`;
            else if (patient.contactNo) displayText += ` (Contact: ${patient.contactNo})`;
            li.textContent = displayText;
            li.addEventListener('click', () => selectPatient(patient));
            ul.appendChild(li);
        });
        patientNameSuggestionsDiv.appendChild(ul);
        patientNameSuggestionsDiv.style.display = 'block';
    }

    async function selectPatient(patient) {
        if (!patient || !patient.id) {
            console.error("selectPatient called with invalid patient data");
            return;
        }
        currentPatientId = patient.id;
        patientNameInput.value = patient.name || '';
        patientNameSuggestionsDiv.innerHTML = '';
        patientNameSuggestionsDiv.style.display = 'none';

        // Populate demographic fields from the selected patient object
        ageInput.value = patient.ageLastRecorded || '';
        if (patient.ageLastRecorded && patient.ageUnitLastRecorded) {
            ageInput.value += ` ${patient.ageUnitLastRecorded}`;
        }
        genderInput.value = patient.sex || '';
        reportCodeInput.value = patient.pReg || ''; 
        contactNoInput.value = patient.contactNo || '';
        nicNoInput.value = patient.nicNo || '';
        fatherNameInput.value = patient.fatherName || ''; // Occupation
        addressInput.value = patient.address || '';
        
        // Clear previous visit-specific data first
        clearOnlyVisitSpecificFields(); 
        patientVisitHistory = [];
        currentVisitHistoryIndex = -1;
        updateNavigationButtonsState();

        // Fetch and display all visits, then load the latest one
        await fetchAndDisplayPatientVisitHistory(patient.id);

        if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Selected patient: ${patient.name} (ID: ${patient.id}). Last visit details loading...`;
    }

    function clearPatientDemographicFields(clearName = true) {
        if (clearName) patientNameInput.value = '';
        ageInput.value = '';
        genderInput.value = '';
        reportCodeInput.value = '';
        contactNoInput.value = '';
        nicNoInput.value = '';
        fatherNameInput.value = '';
        addressInput.value = '';
        currentPatientId = null;
        
        // Also clear visit history and related state
        patientVisitHistory = [];
        currentVisitHistoryIndex = -1;
        updateNavigationButtonsState();
        clearOnlyVisitSpecificFields(); 
    }

    function clearOnlyVisitSpecificFields() {
        complaintsInput.value = '';
        examinationInput.value = '';
        diagnosisInput.value = '';
        medicationsInput.value = '';
        reportDateInput.value = ''; // Also clear report date if it's visit-specific
        // Note: reportCodeInput (PReg) is patient-specific, so not cleared here.
        // currentLastVisitData = null; // REPLACED
    }

    if (patientNameInput) {
        patientNameInput.addEventListener('input', handlePatientNameInput);
        // Hide suggestions when clicking outside
        document.addEventListener('click', (event) => {
            if (!patientNameInput.contains(event.target) && !patientNameSuggestionsDiv.contains(event.target)) {
                patientNameSuggestionsDiv.style.display = 'none';
            }
        });
    }

    // --- Audio Recording & Processing (Modified for Patient Creation - Task 3.2, 3.3, 5.2) ---
    if (startRecordingButton && stopRecordingButton && transcriptionOutputDiv) {
        startRecordingButton.addEventListener('click', async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                startRecordingButton.disabled = true;
                stopRecordingButton.style.display = 'inline-block';
                startRecordingButton.style.display = 'none';
                reprocessAudioButton.style.display = 'none';
                transcriptionOutputDiv.textContent = 'Recording...';
                audioChunks = [];

                if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                    recordedAudioMimeType = 'audio/ogg;codecs=opus';
                } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    recordedAudioMimeType = 'audio/webm;codecs=opus';
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    recordedAudioMimeType = 'audio/mp4';
                } else {
                    transcriptionOutputDiv.textContent = 'Error: No suitable audio format supported by browser.';
                    console.error("No suitable MIME type found for MediaRecorder.");
                    startRecordingButton.disabled = false;
                    stopRecordingButton.style.display = 'none';
                    startRecordingButton.style.display = 'inline-block';
                    return;
                }
                console.log("Using MIME type for recording:", recordedAudioMimeType);

                mediaRecorder = new MediaRecorder(stream, { mimeType: recordedAudioMimeType });

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = async () => {
                    transcriptionOutputDiv.textContent = 'Processing audio...';

                    if (audioChunks.length === 0) {
                        transcriptionOutputDiv.textContent = 'No audio recorded.';
                        startRecordingButton.disabled = false;
                        stopRecordingButton.disabled = true;
                        startRecordingButton.style.display = 'inline-block';
                        stopRecordingButton.style.display = 'none';
                        return;
                    }

                    const audioBlob = new Blob(audioChunks, { type: recordedAudioMimeType });
                    audioChunks = [];

                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = async () => {
                        const base64AudioData = reader.result.split(',')[1];
                        
                        // Store for potential reprocessing
                        lastRecordedBase64AudioData = base64AudioData;
                        lastRecordedMimeType = recordedAudioMimeType.split(';')[0];
                        
                        try {
                            await processAudioAndPopulateFields(lastRecordedBase64AudioData, lastRecordedMimeType);
                            reprocessAudioButton.style.display = 'inline-block';
                        } catch (error) {
                            console.error('Error processing audio:', error);
                            transcriptionOutputDiv.textContent = 'Error: Could not process audio. ' + error.message;
                            if(lastRecordedBase64AudioData) reprocessAudioButton.style.display = 'inline-block'; 
                        }
                    };
                };
                mediaRecorder.start();
                stopRecordingButton.disabled = false;

            } catch (error) {
                console.error('Error starting recording:', error);
                transcriptionOutputDiv.textContent = 'Error: Could not start recording. Check microphone permissions.';
                startRecordingButton.disabled = false;
                stopRecordingButton.disabled = true;
                stopRecordingButton.style.display = 'none';
                startRecordingButton.style.display = 'inline-block';
            }
        });

        stopRecordingButton.addEventListener('click', () => {
            if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
                stopRecordingButton.disabled = true;
                startRecordingButton.disabled = false;
                startRecordingButton.style.display = 'inline-block';
                stopRecordingButton.style.display = 'none';
            } else {
                console.warn("Stop recording clicked but mediaRecorder not active or not recording.");
                stopRecordingButton.disabled = true;
                startRecordingButton.disabled = false;
                startRecordingButton.style.display = 'inline-block';
                stopRecordingButton.style.display = 'none';
            }
        });
    }

    // Add event listener for the reprocess button
    if (reprocessAudioButton) {
        reprocessAudioButton.addEventListener('click', async () => {
            if (lastRecordedBase64AudioData && lastRecordedMimeType) {
                transcriptionOutputDiv.textContent = 'Reprocessing last audio...';
                try {
                    await processAudioAndPopulateFields(lastRecordedBase64AudioData, lastRecordedMimeType);
                    transcriptionOutputDiv.textContent += ' Reprocessing complete.';
                } catch (error) {
                    console.error('Error reprocessing audio:', error);
                    transcriptionOutputDiv.textContent = 'Error: Could not reprocess audio. ' + error.message;
                }
            } else {
                transcriptionOutputDiv.textContent = 'No audio available to reprocess.';
            }
        });
    }

    // Modify the function that processes Gemini's response
    async function processAudioAndPopulateFields(audioData, mimeType) {
        if (!audioData) {
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'No audio data to process.';
            return;
        }
        if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'Processing audio...';
        
        let requestBody = { audioData, audioMimeType: mimeType };

        // Include existingPatientData if a specific visit is loaded (Task 8.3 adjustment)
        if (currentVisitHistoryIndex !== -1 && patientVisitHistory[currentVisitHistoryIndex]) {
            const currentVisit = patientVisitHistory[currentVisitHistoryIndex];
            // Construct existingPatientData from the current visit
            // Ensure it matches the structure expected by processPatientAudio CF
            requestBody.existingPatientData = {
                patientName: patientNameInput.value, // Demographic data is from main fields
                age: ageInput.value,
                gender: genderInput.value,
                complaints: currentVisit.complaints || '',
                examination: currentVisit.examination || '',
                diagnosis: currentVisit.diagnosis || '',
                medications: currentVisit.medications || [] // Assuming medications is an array of objects
            };
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Processing audio (updating visit ${currentVisit.id || 'current'})...`;
        } else {
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'Processing audio (new visit data)..._PREVIOUS_AUDIO_PROCESS_TEXT_WAS_Processing audio..._HERE_PROCESS_AUDIO_TEXT_ENDS';
        }

        try {
            const response = await fetch(processAudioFunctionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`AI processing failed: ${response.status} ${response.statusText}. Details: ${errorBody}`);
            }
            const data = await response.json();
            transcriptionOutputDiv.textContent = 'AI processing complete. Populating fields...';

            // Populate fields from Gemini response (current behavior)
            patientNameInput.value = data.patientName || '';
            ageInput.value = data.age || '';
            genderInput.value = data.gender || '';
            complaintsInput.value = data.complaints || '';
            diagnosisInput.value = data.diagnosis || '';
            examinationInput.value = data.examination || '';
            if (data.medications && Array.isArray(data.medications)) {
                medicationsInput.value = data.medications.map(med => `${med.name};${med.instructions};${med.duration}`).join('\n');
            } else {
                medicationsInput.value = '';
            }

            // After populating from Gemini, check if we need to create a new patient
            // This happens if no patient was selected via autocomplete (currentPatientId is null)
            // and Gemini provided a patient name.
            // The AI response is now the full state, so currentLastVisitData might be implicitly updated by populating fields
            // For now, let's assume AI provides the full new state. We can refine currentLastVisitData update if needed.
            if (!currentPatientId && patientNameInput.value.trim() !== '') {
                transcriptionOutputDiv.textContent += ' Attempting to save new patient data from voice...';
                const newPatientData = {
                    name: patientNameInput.value.trim(),
                    ageLastRecorded: ageInput.value.trim(), // Or parse more carefully if needed
                    sex: genderInput.value.trim(),
                    // Add other fields if Gemini is expected to provide them or leave blank
                    contactNo: contactNoInput.value.trim(), // If user filled it manually before voice
                    nicNo: nicNoInput.value.trim(),
                    fatherName: fatherNameInput.value.trim(),
                    address: addressInput.value.trim(),
                    isImported: false
                };
                try {
                    const createResponse = await fetch(createPatientFunctionUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newPatientData)
                    });
                    if (createResponse.ok) {
                        const creationResult = await createResponse.json();
                        currentPatientId = creationResult.patientId;
                        transcriptionOutputDiv.textContent = `New patient '${newPatientData.name}' saved with ID: ${currentPatientId}. Fields populated.`;
                        // Optionally update reportCodeInput with PReg if it's part of creationResult and relevant
                         if(creationResult.pReg) reportCodeInput.value = creationResult.pReg; 
                    } else {
                        const errorResult = await createResponse.json().catch(() => ({error: 'Unknown error saving patient'}));
                        transcriptionOutputDiv.textContent = `Error saving new patient: ${errorResult.error || createResponse.statusText}. Fields populated from voice.`;
                        console.error("Error saving new patient from voice:", errorResult);
                    }
                } catch (creationError) {
                    transcriptionOutputDiv.textContent = `Network error saving new patient: ${creationError.message}. Fields populated from voice.`;
                    console.error("Network error saving new patient from voice:", creationError);
                }
            } else if (currentPatientId) {
                transcriptionOutputDiv.textContent = `Fields populated for existing patient ID: ${currentPatientId}.`;
            } else {
                transcriptionOutputDiv.textContent = 'Fields populated. No patient context to save.';
            }

        } catch (error) {
            console.error("Error during audio processing or field population:", error);
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Error: ${error.message}`;
        }
    }

    // --- Report Generation (Existing, but interacts with new patient logic) ---
    if (generateReportButton) {
        generateReportButton.addEventListener('click', async () => {
            // First, ensure report preview is updated (which also has patient creation fallback)
            await updateReportPreview(); 
            // The actual patient creation logic is now more robustly handled in ensurePatientExists
            // and called by print, or by voice processing.
        });
    }

    async function ensurePatientExists() {
        if (currentPatientId) {
            return currentPatientId;
        }
        // If no patient ID, but name is filled, try to create one.
        const name = patientNameInput.value.trim();
        if (!name) {
            // alert('Patient Name is required to save or print.');
            console.warn('Patient Name is required to save or print.');
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'Patient Name is required to save or print.';
            return null;
        }
        if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'Creating new patient...';
        try {
            const patientDataToCreate = {
                name: name,
                ageLastRecorded: ageInput.value.trim().split(' ')[0] || '', // Attempt to get just age number
                ageUnitLastRecorded: ageInput.value.trim().split(' ')[1] || '', // Attempt to get unit
                sex: genderInput.value.trim(),
                contactNo: contactNoInput.value.trim(),
                nicNo: nicNoInput.value.trim(),
                fatherName: fatherNameInput.value.trim(), // Occupation
                address: addressInput.value.trim(),
                pReg: reportCodeInput.value.trim() // Send pReg if user entered it, backend handles if empty for new auto-gen
            };

            const response = await fetch(createPatientFunctionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patientDataToCreate)
            });
            if (!response.ok) {
                const errorResult = await response.json().catch(() => ({ error: 'Unknown server error during patient creation' }));
                throw new Error(errorResult.error || `Server error: ${response.status}`);
            }
            const result = await response.json();
            currentPatientId = result.patientId; 
            reportCodeInput.value = result.pReg || currentPatientId; // Update PReg field with new ID/PReg
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `New patient created: ${name} (ID: ${currentPatientId}).`;
            return currentPatientId;
        } catch (error) {
            console.error("Error creating patient:", error);
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Error creating patient: ${error.message}`;
            // alert(`Error creating patient: ${error.message}`);
            return null;
        }
    }

    async function updateReportPreview() {
        // This function now JUST updates the visual preview based on current form inputs.
        // Patient creation is handled by ensurePatientExists, called before saving a visit.
        const reportData = {
            patientName: patientNameInput.value,
            age: ageInput.value,
            gender: genderInput.value,
            reportDate: reportDateInput.value || new Date().toLocaleString(),
            reportCode: reportCodeInput.value,
            complaints: complaintsInput.value,
            examination: examinationInput.value,
            diagnosis: diagnosisInput.value,
            medications: medicationsInput.value.split('\n').filter(line => line.trim() !== '').map(line => {
                const parts = line.split(';');
                return { 
                    name: parts[0] || "N/A", 
                    instructions: parts[1] || "N/A", 
                    duration: parts[2] || "N/A" 
                };
            })
        };

        document.getElementById('reportPatientNameDisplay').textContent = reportData.patientName;
        document.getElementById('reportAgeDisplay').textContent = reportData.age;
        document.getElementById('reportGenderDisplay').textContent = reportData.gender;
        document.getElementById('reportDateDisplay').textContent = reportData.reportDate;
        document.getElementById('reportCodeDisplay').textContent = reportData.reportCode;
        document.getElementById('reportComplaintsDisplay').innerHTML = reportData.complaints.replace(/\n/g, '<br>');
        document.getElementById('reportExaminationDisplay').innerHTML = reportData.examination.replace(/\n/g, '<br>');
        document.getElementById('reportDiagnosisDisplay').innerHTML = reportData.diagnosis.replace(/\n/g, '<br>');

        const medListDiv = document.getElementById('reportMedicationsList');
        medListDiv.innerHTML = ''; // Clear previous medications
        if (reportData.medications.length > 0) {
            reportData.medications.forEach(med => {
                const medItem = document.createElement('div');
                medItem.classList.add('medication-item');

                const nameCol = document.createElement('div');
                nameCol.classList.add('medication-name-col');
                nameCol.textContent = med.name;
                medItem.appendChild(nameCol);

                const instrCol = document.createElement('div');
                instrCol.classList.add('medication-instr-col');
                instrCol.textContent = med.instructions;
                medItem.appendChild(instrCol);

                const durCol = document.createElement('div');
                durCol.classList.add('medication-dur-col');
                durCol.textContent = med.duration;
                medItem.appendChild(durCol);
                
                medListDiv.appendChild(medItem);
            });
        } else {
            medListDiv.innerHTML = '<span>No medications listed.</span>';
        }
        if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'Report preview generated.';
        
        initializeMedicationColumnResizing(); // Call after items are rendered
    }

    // --- NEW: Medication Column Resizing (Task 5.5) ---
    function initializeMedicationColumnResizing() {
        const reportOutput = document.getElementById('reportOutput');
        if (!reportOutput) return;

        // Wait for the DOM to contain medication items after report generation
        setTimeout(() => {
            const medicationItems = reportOutput.querySelectorAll('.medication-item');
            if (medicationItems.length === 0) return;

            // For each medication item, find its columns
            medicationItems.forEach(item => {
                const nameCol = item.querySelector('.medication-name-col');
                const instrCol = item.querySelector('.medication-instr-col');
                const durCol = item.querySelector('.medication-dur-col');

                // Apply stored/default widths
                if (nameCol) nameCol.style.flexBasis = currentLayoutSettings.medicationColWidths.name;
                if (instrCol) instrCol.style.flexBasis = currentLayoutSettings.medicationColWidths.instructions;
                if (durCol) durCol.style.flexBasis = currentLayoutSettings.medicationColWidths.duration;
                
                // For simplicity, we'll make only the first two columns resizable.
                // The third will take up remaining space or its default if others don't sum to 100%.
                // Resizing one column needs to affect the others if we want to maintain a sum.
                // A more robust solution might involve resizing handles between columns.
                // For now, let's allow resizing name and instruction columns independently.

                [nameCol, instrCol].forEach((col, index) => {
                    if (!col) return;
                    interact(col)
                        .resizable({
                            edges: { right: true }, // Resize from the right edge
                            listeners: {
                                move(event) {
                                    const target = event.target;
                                    let newWidth = event.rect.width; // This is pixel width
                                    target.style.flexBasis = `${newWidth}px`; // Use pixels for direct manipulation

                                    // Update stored settings (as pixels or convert back to percentage if desired)
                                    if (index === 0) { // Name column
                                        currentLayoutSettings.medicationColWidths.name = `${newWidth}px`;
                                    } else if (index === 1) { // Instruction column
                                        currentLayoutSettings.medicationColWidths.instructions = `${newWidth}px`;
                                    }
                                    // Note: Durations column will auto-adjust based on flex properties.
                                    // If we want to store its percentage, we'd need to calculate it.
                                },
                                end(event) {
                                    // Persist pixel values. If percentages are desired, more complex calculation needed here.
                                    console.log('Medication column widths updated:', currentLayoutSettings.medicationColWidths);
                                }
                            },
                            modifiers: [
                                interact.modifiers.restrictSize({
                                    min: { width: 30 } // Minimum width for a column
                                })
                            ]
                        });
                });
            });
        }, 100);
    }

    // --- Visit Navigation Functions (Task 8.3) ---
    function updateNavigationButtonsState() {
        if (!prevVisitButton || !nextVisitButton) return;
        
        const hasVisitHistory = patientVisitHistory && patientVisitHistory.length > 0;
        const currentIndex = currentVisitHistoryIndex;
        
        if (!hasVisitHistory || currentIndex === -1) {
            // No visits or no specific visit loaded
            prevVisitButton.disabled = true;
            nextVisitButton.disabled = true;
        } else {
            // Enable/disable based on current position in history
            prevVisitButton.disabled = (currentIndex >= patientVisitHistory.length - 1);
            nextVisitButton.disabled = (currentIndex <= 0);
        }
    }

    async function fetchAndDisplayPatientVisitHistory(patientId) {
        if (!patientId) {
            console.warn("fetchAndDisplayPatientVisitHistory called with no patientId");
            return;
        }

        try {
            const response = await fetch(`${getAllPatientVisitsFunctionUrl}?patientId=${encodeURIComponent(patientId)}&orderBy=visitDate&orderDirection=desc`);
            if (!response.ok) {
                if (response.status === 404) {
                    // No visits found - this is normal for new patients
                    patientVisitHistory = [];
                    currentVisitHistoryIndex = -1;
                    updateNavigationButtonsState();
                    if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = "No previous visits found for this patient.";
                    return;
                }
                throw new Error(`Failed to fetch visit history: ${response.statusText}`);
            }

            const visits = await response.json();
            patientVisitHistory = visits || [];
            
            if (patientVisitHistory.length > 0) {
                // Load the most recent visit (index 0) into the form
                currentVisitHistoryIndex = 0;
                loadVisitDataIntoForm(patientVisitHistory[0]);
                if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Loaded last visit (${patientVisitHistory.length} total visits). Use navigation buttons to browse.`;
            } else {
                currentVisitHistoryIndex = -1;
                if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = "No previous visits found for this patient.";
            }
            
            updateNavigationButtonsState();

        } catch (error) {
            console.error("Error fetching patient visit history:", error);
            patientVisitHistory = [];
            currentVisitHistoryIndex = -1;
            updateNavigationButtonsState();
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Error loading visit history: ${error.message}`;
        }
    }

    function loadVisitDataIntoForm(visit) {
        if (!visit) {
            console.warn("loadVisitDataIntoForm called with no visit data");
            return;
        }

        // Populate visit-specific fields
        complaintsInput.value = visit.complaints || '';
        examinationInput.value = visit.examination || '';
        diagnosisInput.value = visit.diagnosis || '';
        
        // Handle visit date
        if (visit.visitDate) {
            reportDateInput.value = visit.visitDate; // Expecting YYYY-MM-DD format
        }

        // Handle medications
        if (visit.medications && Array.isArray(visit.medications)) {
            const medicationLines = visit.medications.map(med => {
                const name = med.name || 'N/A';
                const instructions = med.instructions || 'N/A';
                const duration = med.duration || 'N/A';
                return `${name};${instructions};${duration}`;
            });
            medicationsInput.value = medicationLines.join('\n');
        } else {
            medicationsInput.value = '';
        }
    }

    // --- Print Report Button (Task 5.4 - Modified to save visit) ---
    if (printReportButton) {
        printReportButton.addEventListener('click', async () => {
            const patientId = await ensurePatientExists();
            if (!patientId) return;

            await updateReportPreview(); // Update the preview first

            // Gather visit data from current form inputs
            const visitDataPayload = {
                visitDate: reportDateInput.value ? new Date(reportDateInput.value).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                complaints: complaintsInput.value.trim(),
                examination: examinationInput.value.trim(),
                diagnosis: diagnosisInput.value.trim(),
                medications: medicationsInput.value.trim().split('\n').filter(line => line.trim() !== '').map(line => {
                    const parts = line.split(';');
                    return {
                        name: parts[0] ? parts[0].trim() : 'N/A',
                        instructions: parts[1] ? parts[1].trim() : 'N/A',
                        duration: parts[2] ? parts[2].trim() : 'N/A'
                    };
                }),
                // Add amountCharged if you have an input for it on this page, otherwise it's mainly for historical imports
                 // amountCharged: parseFloat(document.getElementById('visitAmountInput')?.value) || 0 
            };

            // If a specific historical visit is loaded, include its ID to update it (Task 8.3 adjustment)
            if (currentVisitHistoryIndex !== -1 && patientVisitHistory[currentVisitHistoryIndex] && patientVisitHistory[currentVisitHistoryIndex].id) {
                visitDataPayload.visitId = patientVisitHistory[currentVisitHistoryIndex].id;
            }

            try {
                if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Saving visit for patient ${patientId}...`;
                const response = await fetch(savePatientVisitFunctionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ patientId: patientId, visitData: visitDataPayload })
                });
                if (!response.ok) {
                    const errorResult = await response.json().catch(() => ({error: 'Failed to save visit.'}));
                    throw new Error(errorResult.error || `Server error: ${response.statusText}`);
                }
                const saveResult = await response.json();
                if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Visit ${saveResult.action || 'saved'} (ID: ${saveResult.visitId}). Preparing to print...`;
                
                // After saving, refresh visit history to reflect changes or new visit
                await fetchAndDisplayPatientVisitHistory(patientId);

                window.print(); // Open print dialog
            } catch (error) {
                console.error("Error saving patient visit:", error);
                if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Error saving visit: ${error.message}`;
                // alert(`Error saving visit: ${error.message}`);
            }
        });
    }

    // --- Generate CSS Button (Task 5.6) ---
    if (generateCssButton && generatedCssOutput) {
        generateCssButton.addEventListener('click', () => {
            let cssString = "/* CSS Generated from Current Layout */\n\n";
            cssString += "/* Note: Ensure these selectors match your style.css if you copy them. */\n";
            cssString += "/* Consider converting px to mm if your original stylesheet uses mm. */\n\n";

            reportFieldElements.forEach(el => {
                const id = el.id;
                if (currentLayoutSettings[id]) {
                    const settings = currentLayoutSettings[id];
                    cssString += `#${id} {\n`;
                    if (settings.x !== undefined) cssString += `  left: ${settings.x}px;\n`;
                    if (settings.y !== undefined) cssString += `  top: ${settings.y}px;\n`;
                    if (settings.width !== undefined) cssString += `  width: ${settings.width}px;\n`;
                    if (settings.height !== undefined) cssString += `  height: ${settings.height}px;\n`;
                    if (settings.fontSize !== undefined) cssString += `  font-size: ${settings.fontSize}pt;\n`;
                    cssString += `  /* position: absolute; */ /* Assuming this is already set */\n`;
                    cssString += `}\n\n`;
                }
            });

            if (currentLayoutSettings.medicationColWidths) {
                cssString += "/* Medication Column Widths */\n";
                const { name, instructions, duration } = currentLayoutSettings.medicationColWidths;
                if (name) {
                    cssString += `.medication-name-col {\n  flex-basis: ${name};\n}\n\n`;
                }
                if (instructions) {
                    cssString += `.medication-instr-col {\n  flex-basis: ${instructions};\n}\n\n`;
                }
                if (duration) {
                    cssString += `.medication-dur-col {\n  flex-basis: ${duration};\n}\n\n`;
                }
            }
            
            generatedCssOutput.value = cssString;
            if(transcriptionOutputDiv) transcriptionOutputDiv.textContent = 'CSS for current layout generated below.';
        });
    }

    // --- Event Listeners for new buttons (Task 8.3) ---
    if (clearVisitFieldsButton) {
        clearVisitFieldsButton.addEventListener('click', () => {
            clearOnlyVisitSpecificFields();
            currentVisitHistoryIndex = -1; // Indicate no specific historical visit is loaded
            // Transcription output should reflect that the form is ready for new visit entry or select a patient
            if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = "Visit fields cleared. Ready for new visit data or select a patient.";
            updateNavigationButtonsState();
        });
    }

    if (prevVisitButton) {
        prevVisitButton.addEventListener('click', () => {
            if (currentVisitHistoryIndex > 0) {
                currentVisitHistoryIndex--;
                loadVisitDataIntoForm(patientVisitHistory[currentVisitHistoryIndex]);
                if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Displaying previous visit (${currentVisitHistoryIndex + 1} of ${patientVisitHistory.length}).`;
            }
            updateNavigationButtonsState();
        });
    }

    if (nextVisitButton) {
        nextVisitButton.addEventListener('click', () => {
            if (currentVisitHistoryIndex >= 0 && currentVisitHistoryIndex < patientVisitHistory.length - 1) {
                currentVisitHistoryIndex++;
                loadVisitDataIntoForm(patientVisitHistory[currentVisitHistoryIndex]);
                if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = `Displaying next visit (${currentVisitHistoryIndex + 1} of ${patientVisitHistory.length}).`;
            }
            updateNavigationButtonsState();
        });
    }

    // --- Initial Page Load Setup ---
    try {
        await loadLayoutFromServer(); // Load saved layout settings first
    } catch (error) {
        console.warn("Could not load layout from server on initial load:", error.message);
        // Apply default CSS or fallback if needed, though applyLayoutSettings handles missing settings.
    }
    initializeInteractJs(); // Initialize draggable/resizable elements after settings are potentially loaded
    setupFontSizeControls(); // Setup font size inputs after settings are potentially loaded
    updateNavigationButtonsState(); // Initial state for nav buttons

    if (transcriptionOutputDiv) transcriptionOutputDiv.textContent = "System ready. Select a patient or start new report.";
    
    // Example: Auto-select a patient if ID is in URL (for testing/dev)
    // const urlParams = new URLSearchParams(window.location.search);
    // const autoPatientId = urlParams.get('patientId');
    // if (autoPatientId) {
    //     console.log("Attempting to auto-load patient:", autoPatientId);
    //     // You'd need a function to fetch this specific patient by ID and then call selectPatient
    //     // fetchPatientByIdAndSelect(autoPatientId);
    // }
}); 