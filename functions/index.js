/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const corsNode = require("cors");
const fs = require("fs");
const path = require("path");
const { defineString } = require('firebase-functions/params'); // Added import

const corsMiddleware = corsNode({ origin: true });

admin.initializeApp();
const db = admin.firestore(); // Initialize Firestore

// Define the Gemini API Key parameter globally
const geminiApiKey = defineString("GEMINI_API_KEY");

// Declare genAI and model globally for caching, initially undefined
let genAI;
let model;

// Helper function to initialize and get the Gemini model
function getGeminiModel() {
    if (!model) { // Only initialize if not already done
        const key = geminiApiKey.value(); // Access .value() at runtime
        if (key) {
            genAI = new GoogleGenerativeAI(key);
            model = genAI.getGenerativeModel({ model: "gemini-2.5-pro-preview-06-05" });
            logger.info("Gemini AI Model initialized successfully via getGeminiModel().");
        } else {
            logger.error("Gemini API key is not configured. Ensure GEMINI_API_KEY is set. Cannot initialize model.");
            // model remains undefined or null
        }
    }
    return model;
}

// Load medication context data (names, instructions, durations)
let medicationContext = { medicationNames: [], instructions: [], durations: [] };
try {
    // Updated to load the new context file
    const contextDataPath = path.join(__dirname, "medication_context_data.json"); 
    if (fs.existsSync(contextDataPath)) {
        const rawData = fs.readFileSync(contextDataPath, "utf8");
        medicationContext = JSON.parse(rawData);
        logger.info("Successfully loaded medication_context_data.json:", 
                    { names: medicationContext.medicationNames.length, 
                      instructions: medicationContext.instructions.length, 
                      durations: medicationContext.durations.length });
    } else {
        logger.error("medication_context_data.json not found at path:", {path: contextDataPath});
    }
} catch (error) {
    logger.error("Error loading or parsing medication_context_data.json:", {error: error.message});
}

exports.processPatientAudio = onRequest(
    { 
        region: 'us-central1', 
        timeoutSeconds: 300, 
        memory: '1GB' 
    },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for processPatientAudio", {method: req.method, bodyKeys: Object.keys(req.body || {})});

            if (req.method !== "POST") {
                logger.warn("Method not allowed", {method: req.method });
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            const localModel = getGeminiModel(); // Call the helper to get the model
            if (!localModel) { // Check if the model was successfully initialized
                logger.error("Gemini model not available for processPatientAudio. API key likely missing or failed initialization.");
                return res.status(500).send({ error: "Internal Server Error: AI model not configured." });
            }

            try {
                const { audioData, audioMimeType, existingPatientData } = req.body;
                
                if (!audioData) {
                    logger.warn("Bad Request: Missing audioData");
                    return res.status(400).send({ error: "Bad Request: Missing audioData." });
                }
                const effectiveMimeType = audioMimeType || "audio/ogg";
                logger.info("Processing audio with MIME type:", {mimeType: effectiveMimeType});
                if (existingPatientData) {
                    logger.info("Existing patient data provided for update:", { fields: Object.keys(existingPatientData) });
                }

                // Original context lines (restored)
                const knownMedicationNamesContext = medicationContext.medicationNames.join(", ");
                const commonInstructionsContext = medicationContext.instructions.join("; ");
                const commonDurationsContext = medicationContext.durations.join("; ");

                let prompt;
                if (existingPatientData) {
                    // Prompt for updating existing data
                    prompt = `
You are an expert medical assistant. You are given existing patient report data and a new audio narration from a doctor for the same patient.
Listen to the audio and intelligently UPDATE the provided existing data based on the doctor's new narration.
Focus on modifying fields if the doctor provides new or changed information for them. If a field is not mentioned in the new audio, try to keep its existing value unless the new context implies it should be cleared or changed.

Here is the existing patient report data:
--- EXISTING DATA START ---
Patient Name: ${existingPatientData.patientName || 'N/A'}
Age: ${existingPatientData.age || 'N/A'}
Gender: ${existingPatientData.gender || 'N/A'}
Complaints: ${existingPatientData.complaints || 'N/A'}
Examination: ${existingPatientData.examination || 'N/A'}
Diagnosis: ${existingPatientData.diagnosis || 'N/A'}
Medications:
${(existingPatientData.medications && existingPatientData.medications.length > 0) ? existingPatientData.medications.map(med => `- ${med.name}; ${med.instructions}; ${med.duration}`).join('\n') : 'N/A'}
--- EXISTING DATA END ---

Here is a list of known medication names that might be mentioned:
--- KNOWN MEDICATION NAMES START ---
${knownMedicationNamesContext}
--- KNOWN MEDICATION NAMES END ---

Common instructions phrasings:
--- COMMON INSTRUCTIONS START ---
${commonInstructionsContext}
--- COMMON INSTRUCTIONS END ---

Common durations phrasings:
--- COMMON DURATIONS START ---
${commonDurationsContext}
--- COMMON DURATIONS END ---

Based on the NEW audio narration, update the patient's information. Provide the complete, updated information in a single, valid JSON object format with the following fields:
1.  patientName (string, update if clearly stated as different)
2.  age (string, update if clearly stated as different)
3.  gender (string, update if clearly stated as different)
4.  complaints (string, update with new information or merge intelligently. This should include current complaints AND relevant patient-reported history from the new audio.)
5.  examination (string, update with new findings)
6.  diagnosis (string, update with new diagnosis)
7.  medications (array of objects, where each object MUST have "name", "instructions", and "duration" fields). Update this list based on the new audio. If new medications are added, include them. If existing medications are explicitly changed (e.g., dosage, duration) or stopped, reflect that. If medications are not discussed, you may carry over the existing ones if appropriate, or the doctor might state to continue them.

Prioritize the doctor's exact narrated details for each specific medication in the new audio.
If instructions or duration for a medication (new or existing being modified) are unclear or not provided in the new narration, set them to "N/A".

Ensure the entire output is ONLY the JSON object. Do not include any explanatory text, markdown formatting (like \`\`\`json), or anything else before or after the JSON.

Example JSON output structure (this is the FULL structure to return, updated):
{
  "patientName": "Updated Name if any",
  "age": "Updated Age if any",
  "gender": "Updated Gender if any",
  "complaints": "Updated or merged complaints",
  "examination": "Updated examination findings",
  "diagnosis": "Updated diagnosis",
  "medications": [
    { "name": "Tab Atcam 8 mg", "instructions": "Updated instructions", "duration": "Updated duration" },
    { "name": "NewMed", "instructions": "1 daily", "duration": "5 days" }
  ]
}
`;
                } else {
                    // Original prompt for new data extraction
                    prompt = `
You are an expert medical assistant. Listen to the following audio of a doctor's narration for a patient report.
The doctor will mention patient details, complaints, examination findings, diagnosis, and medications (including their specific instructions and durations).

Here is a list of known medication names that might be mentioned:
--- KNOWN MEDICATION NAMES START ---
${knownMedicationNamesContext}
--- KNOWN MEDICATION NAMES END ---

Here is a list of common phrasings for instructions that might be used:
--- COMMON INSTRUCTIONS START ---
${commonInstructionsContext}
--- COMMON INSTRUCTIONS END ---

Here is a list of common phrasings for durations that might be used:
--- COMMON DURATIONS START ---
${commonDurationsContext}
--- COMMON DURATIONS END ---

Extract the following information and provide it in a single, valid JSON object format:
1.  patientName (string)
2.  age (string)
3.  gender (string)
4.  complaints (string, a summary. This should include current complaints AND relevant patient-reported history, for example, phrases like "No history of..." or "Past history of...")
5.  examination (string, a summary of the physical examination findings by the doctor)
6.  diagnosis (string, a summary)
7.  medications (array of objects, where each object MUST have "name", "instructions", and "duration" fields).
    - For each medication mentioned in the audio, accurately capture its name, the specific instructions given, and the specific duration given.
    - Use the provided lists of known medication names, common instructions, and common durations to help improve accuracy of transcription and interpretation, but prioritize the doctor's exact narrated details for each specific medication.
    - If a medication name mentioned is not in the known list, transcribe it as heard.
    - If instructions or duration for a specific medication are unclear or not provided in the narration, set them to "N/A".

Ensure the entire output is ONLY the JSON object. Do not include any explanatory text, markdown formatting (like \`\`\`json), or anything else before or after the JSON.

Example JSON output structure:
{
  "patientName": "Mrs Rana Shahid",
  "age": "38 years",
  "gender": "Female",
  "complaints": "Headache, Neck pain, Disturbed sleep x 3 days",
  "examination": "No Neurological Deficit B.P 130/85",
  "diagnosis": "TH, HTN",
  "medications": [
    { "name": "Tab Atcam 8 mg", "instructions": "ایک گولی روزانہ شام کو تین دن کیلئے اس کے بعد جب درد ہو", "duration": "15" },
    { "name": "Aspirin", "instructions": "1 tablet daily", "duration": "N/A" }
  ]
}
`;
                }

                const audioPart = {
                    inlineData: {
                        mimeType: effectiveMimeType,
                        data: audioData
                    }
                };
                
                const generationConfig = {
                    temperature: 0.1,
                    topK: 1,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                    responseMimeType: "application/json",
                };

                const safetySettings = [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                ];

                logger.info("Sending request to Gemini API...", {model: "gemini-2.5-pro-preview-06-05"});
                const result = await localModel.generateContent({
                    contents: [{ role: "user", parts: [audioPart, {text: prompt}] }],
                    generationConfig,
                    safetySettings
                });
                
                const response = result.response;
                
                if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content || !response.candidates[0].content.parts || response.candidates[0].content.parts.length === 0) {
                    logger.error("Gemini API returned an empty or invalid response structure", {response: JSON.stringify(response, null, 2)});
                    throw new Error("Gemini API returned an invalid response structure.");
                }

                const responsePart = response.candidates[0].content.parts[0];
                if (typeof responsePart.text !== 'string') { 
                    logger.error("Gemini API response part has no text or is not a string.", {part: JSON.stringify(responsePart, null, 2)});
                    throw new Error("Gemini API response part missing or invalid text content.");
                }
                const responseText = responsePart.text;
                logger.info("Raw Gemini API response text received.", {length: responseText.length});

                let jsonData;
                try {
                    const cleanedText = responseText.replace(/^```json\s*|```\s*$/g, '').trim();
                    jsonData = JSON.parse(cleanedText);
                } catch (parseError) {
                    logger.error("Failed to parse Gemini response as JSON.", {rawText: responseText, error: parseError.message, fullResponse: JSON.stringify(response, null, 2)});
                    return res.status(500).send({ error: "Failed to parse AI response.", details: parseError.message, rawResponse: responseText });
                }
                
                logger.info("Successfully parsed Gemini response.", {data: jsonData});
                return res.status(200).send(jsonData);

            } catch (error) {
                logger.error("Error processing request in try-catch block", {errorMessage: error.message, errorStack: error.stack, fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))});
                const clientError = { 
                    error: "Internal Server Error processing audio.", 
                    details: error.message 
                };
                return res.status(500).send(clientError);
            }
        });
    }
);

// --- New Cloud Function to Save Layout Settings --- (Task 4.2)
exports.saveReportLayout = onRequest(
    { region: 'us-central1', memory: '128MB' }, // Basic requirements for a save function
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for saveReportLayout", {method: req.method});
            if (req.method !== "POST") {
                logger.warn("Method not allowed for saveReportLayout", {method: req.method });
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            try {
                const layoutSettings = req.body;
                if (!layoutSettings || typeof layoutSettings !== 'object' || Object.keys(layoutSettings).length === 0) {
                    logger.warn("Bad Request: Missing or empty layoutSettings in body for saveReportLayout");
                    return res.status(400).send({ error: "Bad Request: Missing or invalid layoutSettings." });
                }

                const layoutDocRef = db.collection('layoutSettings').doc('reportLayoutV1');
                await layoutDocRef.set(layoutSettings);
                logger.info("Layout settings saved successfully to Firestore.", {documentId: 'reportLayoutV1'});
                return res.status(200).send({ success: true, message: "Layout saved." });

            } catch (error) {
                logger.error("Error saving layout settings to Firestore:", {errorMessage: error.message, errorStack: error.stack});
                return res.status(500).send({ error: "Internal Server Error saving layout.", details: error.message });
            }
        });
    }
);

// --- New Cloud Function to Get Layout Settings --- (Task 4.2)
exports.getReportLayout = onRequest(
    { region: 'us-central1', memory: '128MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for getReportLayout", {method: req.method});
            if (req.method !== "GET") {
                logger.warn("Method not allowed for getReportLayout", {method: req.method });
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            try {
                const layoutDocRef = db.collection('layoutSettings').doc('reportLayoutV1');
                const docSnap = await layoutDocRef.get();

                if (!docSnap.exists) {
                    logger.info("No layout settings found in Firestore for reportLayoutV1.");
                    return res.status(404).send({ error: "No layout settings found." });
                }

                const layoutSettings = docSnap.data();
                logger.info("Layout settings retrieved successfully from Firestore.");
                return res.status(200).send(layoutSettings);

            } catch (error) {
                logger.error("Error retrieving layout settings from Firestore:", {errorMessage: error.message, errorStack: error.stack});
                return res.status(500).send({ error: "Internal Server Error retrieving layout.", details: error.message });
            }
        });
    }
);

// --- NEW Cloud Function to Get Last Patient Visit --- (Task 5.12)
exports.getLastPatientVisit = onRequest(
    { region: 'us-central1', memory: '128MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for getLastPatientVisit", { method: req.method, query: req.query });
            if (req.method !== "GET") {
                logger.warn("Method not allowed for getLastPatientVisit", { method: req.method });
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            const patientId = req.query.patientId;
            if (!patientId) {
                logger.warn("Bad Request: Missing patientId query parameter for getLastPatientVisit");
                return res.status(400).send({ error: "Bad Request: Missing patientId query parameter." });
            }

            try {
                const visitsRef = db.collection('patients').doc(patientId).collection('visits');
                // Assuming visitDate is stored in a way that allows correct descending chronological order
                // (e.g., Firestore Timestamp or ISO 8601 string)
                const snapshot = await visitsRef.orderBy('visitDate', 'desc').limit(1).get();

                if (snapshot.empty) {
                    logger.info("No visits found for patient", { patientId });
                    return res.status(404).send({ message: "No visits found for this patient." });
                }

                // Return the data of the last visit, including its ID
                const lastVisitDoc = snapshot.docs[0];
                const lastVisitData = { id: lastVisitDoc.id, ...lastVisitDoc.data() };
                
                logger.info("Last visit retrieved successfully for patient", { patientId, visitId: lastVisitDoc.id });
                return res.status(200).send(lastVisitData);

            } catch (error) {
                logger.error("Error retrieving last visit for patient:", { patientId, errorMessage: error.message, errorStack: error.stack });
                return res.status(500).send({ error: "Internal Server Error retrieving last visit.", details: error.message });
            }
        });
    }
);

// --- Patient Management Cloud Functions (Task 5.1) ---

// Function to create a new patient or add an imported one
// Renaming to createPatientHttp to match script and enabling batching.
exports.createPatientHttp = onRequest(
    { region: 'us-central1', memory: '512MB' }, // Increased memory for batch potential
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for createPatientHttp (batch)", { method: req.method });
            if (req.method !== "POST") {
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            const patientDataArray = req.body.patients;
            if (!patientDataArray || !Array.isArray(patientDataArray) || patientDataArray.length === 0) {
                logger.warn("Bad Request: 'patients' array is required for createPatientHttp.");
                return res.status(400).json({ error: "Request body must be a non-empty array of patient objects under the 'patients' key." });
            }

            logger.info(`createPatientHttp (batch) processing ${patientDataArray.length} patients.`);
            const results = [];
            let successCount = 0;
            let failureCount = 0;
            const errors = [];

            for (const patientData of patientDataArray) {
                try {
                    if (!patientData || !patientData.name || !patientData.pReg) { // Basic validation for batch items
                        logger.warn("Skipping patient in batch due to missing name or pReg:", patientData);
                        failureCount++;
                        errors.push({ pReg: patientData.pReg, error: "Missing name or pReg" });
                        results.push({pReg: patientData.pReg, status: "skipped", reason: "Missing name or pReg"});
                        continue;
                    }

                    const pRegFromData = patientData.pReg;
                    const patientsCollection = db.collection('patients');
                    const now = admin.firestore.FieldValue.serverTimestamp(); // Use admin.firestore

                    // For imported patients (script should always set isImported: true and provide pReg)
                    if (patientData.isImported === true) {
                        const patientDocRef = patientsCollection.doc(pRegFromData); // Use PReg from CSV as Document ID
                        const existingDoc = await patientDocRef.get();

                        if (existingDoc.exists) {
                            logger.info(`Patient with PReg (doc ID) ${pRegFromData} already exists. Skipping creation.`);
                            successCount++; // Count as success as it exists or was processed
                            results.push({ pReg: pRegFromData, id: existingDoc.id, status: "exists" });
                            continue;
                        }

                        const dataToSet = {
                            ...patientData,
                            name_normalized: patientData.name ? patientData.name.trim().toLowerCase() : '' ,
                            createdAt: patientData.createdAt || now, // Use provided or set new
                            updatedAt: now
                        };
                        await patientDocRef.set(dataToSet); // Not merging, as we expect to create if not existing
                        logger.info("Imported patient data set in Firestore.", { documentId: patientDocRef.id, pReg: pRegFromData });
                        successCount++;
                        results.push({ pReg: pRegFromData, id: patientDocRef.id, status: "created" });
                    } else {
                        // This branch is for NON-IMPORTED patients (e.g., from app), requires PReg generation.
                        // For the current script, this path should ideally not be hit if script sets isImported: true.
                        // If script might send isImported: false, this PReg generation logic needs to be robust for batches.
                        // The original single PReg generation logic is complex for batching directly here due to transactions.
                        // For now, log a warning if this path is taken by the import script unexpectedly.
                        logger.warn("Attempted to create non-imported patient via batch import script. This is unexpected.", { pRegFromData });
                        failureCount++;
                        errors.push({ pReg: pRegFromData, error: "Batch creation of non-imported new patients via this endpoint is not fully supported for PReg generation." });
                        results.push({pReg: pRegFromData, status: "error", reason: "PReg generation for new non-imported patient in batch not supported here."});
                        // To properly support, would need a batch PReg allocation or different endpoint.
                    }
                } catch (error) {
                    logger.error("Error processing patient in batch for createPatientHttp:", { pReg: patientData.pReg, errorMessage: error.message, errorStack: error.stack });
                    failureCount++;
                    errors.push({ pReg: patientData.pReg, error: error.message });
                    results.push({ pReg: patientData.pReg, status: "error", reason: error.message});
                }
            }

            logger.info(`Batch createPatientHttp finished. Success/Exists: ${successCount}, Failure: ${failureCount}`);
            if (failureCount > 0) {
                return res.status(207).json({ // Multi-Status
                    message: "Batch patient operation completed with some errors.",
                    successCount,
                    failureCount,
                    results,
                    errors
                });
            } else {
                return res.status(201).json({
                    message: "All patients in batch processed successfully.",
                    successCount,
                    failureCount: 0,
                    results
                });
            }
        });
    }
);

// Function to get a specific patient by ID
exports.getPatient = onRequest(
    { region: 'us-central1', memory: '128MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for getPatient", { method: req.method, query: req.query });
            if (req.method !== "GET") {
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            try {
                const patientId = req.query.id;
                if (!patientId) {
                    logger.warn("Bad Request: Missing patient ID for getPatient");
                    return res.status(400).send({ error: "Bad Request: Missing patient ID." });
                }

                const patientDoc = await db.collection('patients').doc(patientId).get();

                if (!patientDoc.exists) {
                    logger.warn("Patient not found for getPatient", { patientId });
                    return res.status(404).send({ error: "Patient not found." });
                }
                
                logger.info("Patient retrieved successfully.", { patientId });
                return res.status(200).send({ id: patientDoc.id, ...patientDoc.data() });

            } catch (error) {
                logger.error("Error getting patient from Firestore:", { errorMessage: error.message, errorStack: error.stack });
                return res.status(500).send({ error: "Internal Server Error retrieving patient.", details: error.message });
            }
        });
    }
);

// Function to update an existing patient's demographic data
exports.updatePatient = onRequest(
    { region: 'us-central1', memory: '256MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for updatePatient", { method: req.method, query: req.query });
            if (req.method !== "PUT") { 
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            try {
                const patientId = req.query.id;
                const patientData = req.body;

                if (!patientId) {
                    logger.warn("Bad Request: Missing patient ID for updatePatient");
                    return res.status(400).send({ error: "Bad Request: Missing patient ID." });
                }
                if (!patientData || Object.keys(patientData).length === 0) {
                    logger.warn("Bad Request: Missing patient data for updatePatient");
                    return res.status(400).send({ error: "Bad Request: Missing patient data." });
                }
                
                delete patientData.createdAt; 
                delete patientData.isImported;
                
                patientData.updatedAt = FieldValue.serverTimestamp();

                const patientRef = db.collection('patients').doc(patientId);
                await patientRef.update(patientData);
                
                logger.info("Patient updated successfully.", { patientId });
                return res.status(200).send({ success: true, patientId: patientId, message: "Patient updated successfully." });

            } catch (error) {
                logger.error("Error updating patient in Firestore:", { errorMessage: error.message, errorStack: error.stack });
                if (error.code === 5) { 
                     return res.status(404).send({ error: "Patient not found for update." });
                }
                return res.status(500).send({ error: "Internal Server Error updating patient.", details: error.message });
            }
        });
    }
);

// Function to delete a patient
exports.deletePatient = onRequest(
    { region: 'us-central1', memory: '128MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for deletePatient", { method: req.method, query: req.query });
            if (req.method !== "DELETE") {
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            try {
                const patientId = req.query.id;
                if (!patientId) {
                    logger.warn("Bad Request: Missing patient ID for deletePatient");
                    return res.status(400).send({ error: "Bad Request: Missing patient ID." });
                }

                await db.collection('patients').doc(patientId).delete();
                
                logger.info("Patient deleted successfully.", { patientId });
                return res.status(200).send({ success: true, message: "Patient deleted successfully." });

            } catch (error) {
                // Firestore delete doesn't typically error if doc doesn't exist, it just does nothing.
                // So, a 404 check might be redundant unless explicitly needed.
                logger.error("Error deleting patient from Firestore:", { errorMessage: error.message, errorStack: error.stack });
                return res.status(500).send({ error: "Internal Server Error deleting patient.", details: error.message });
            }
        });
    }
);

// Function to search for patients (for autocomplete and patient management page)
exports.searchPatients = onRequest(
    { region: 'us-central1', memory: '256MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for searchPatients", { method: req.method, query: req.query });
            if (req.method !== "GET") {
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            try {
                const searchQueryFromClient = req.query.q;
                const limit = parseInt(req.query.limit, 10) || 10; // Default limit to 10 results

                // Normalize the search query
                const normalizedSearchQuery = searchQueryFromClient ? searchQueryFromClient.trim().toLowerCase() : "";

                if (!normalizedSearchQuery) {
                    // For now, if no query, return a limited set of recent patients for general display
                     const snapshot = await db.collection('patients')
                                           .orderBy('updatedAt', 'desc') // Assuming updatedAt is a timestamp
                                           .limit(limit)
                                           .get();
                    const patients = [];
                    snapshot.forEach(doc => patients.push({ id: doc.id, ...doc.data() }));
                    logger.info(`Returning ${patients.length} recent patients due to empty search query.`);
                    return res.status(200).send(patients);
                }

                const patients = [];
                // Firestore doesn't support native case-insensitive "contains" or "like" queries directly.
                // For robust search, consider:
                // 1. Storing a normalized (e.g., lowercase) version of searchable fields.
                // 2. Using a third-party search service like Algolia or Elasticsearch.
                // For a simple prefix search (case-sensitive):
                // This query finds names starting with the searchQuery.
                // To make it somewhat case-insensitive for prefixes, one might query for searchQuery and searchQuery.toUpperCase(), etc.
                // Or, more effectively, ensure client sends normalized query and search against normalized field.
                
                // Simple approach: search by name (case-sensitive prefix)
                // To improve, client can send lowercase query, and we search against a lowercase 'name_lowercase' field.
                // For now, direct prefix on 'name'.
                const nameQuery = db.collection('patients')
                                    .orderBy('name_normalized') // Order by the normalized field
                                    .where('name_normalized', '>=', normalizedSearchQuery) // Search against normalized field
                                    .where('name_normalized', '<=', normalizedSearchQuery + '\uf8ff')
                                    .limit(limit);
                
                const snapshot = await nameQuery.get();
                snapshot.forEach(doc => {
                    patients.push({ id: doc.id, ...doc.data() });
                });
                
                // If results are less than limit, could also search by pReg, contactNo, nicNo (exact matches)
                // This part can be expanded. For now, primary search is by name.

                logger.info(`Found ${patients.length} patients matching search query.`, { originalQuery: searchQueryFromClient, normalizedQuery: normalizedSearchQuery });
                return res.status(200).send(patients);

            } catch (error) {
                logger.error("Error searching patients in Firestore:", { errorMessage: error.message, errorStack: error.stack });
                return res.status(500).send({ error: "Internal Server Error searching patients.", details: error.message });
            }
        });
    }
);

// --- NEW DIAGNOSTIC FUNCTION TO LIST SOME PATIENTS ---
exports.listSomePatients = onRequest(
    { region: 'us-central1', memory: '128MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for listSomePatients", { method: req.method });
            if (req.method !== "GET") {
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            try {
                const snapshot = await db.collection('patients').limit(5).get();
                if (snapshot.empty) {
                    logger.info("No patients found in the 'patients' collection.");
                    return res.status(404).send({ message: "No patients found." });
                }

                const patients = [];
                snapshot.forEach(doc => {
                    patients.push({ id: doc.id, ...doc.data() });
                });

                logger.info(`Successfully retrieved ${patients.length} patients.`);
                return res.status(200).send(patients);

            } catch (error) {
                logger.error("Error listing patients from Firestore:", { errorMessage: error.message, errorStack: error.stack });
                return res.status(500).send({ error: "Internal Server Error listing patients.", details: error.message });
            }
        });
    }
);

// --- NEW DIAGNOSTIC FUNCTION TO GET ALL VISITS FOR A SPECIFIC PATIENT ---
exports.getVisitsForPatient = onRequest(
    { region: 'us-central1', memory: '128MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for getVisitsForPatient", { method: req.method, query: req.query });
            if (req.method !== "GET") {
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            const patientId = req.query.patientId;
            if (!patientId) {
                logger.warn("Bad Request: Missing patientId query parameter for getVisitsForPatient");
                return res.status(400).send({ error: "Bad Request: Missing patientId query parameter." });
            }

            try {
                const patientDocRef = db.collection('patients').doc(patientId);
                const patientDoc = await patientDocRef.get();

                if (!patientDoc.exists) {
                    logger.info("Patient not found for getVisitsForPatient", { patientId });
                    return res.status(404).send({ message: "Patient not found." });
                }

                const visitsRef = patientDocRef.collection('visits');
                const snapshot = await visitsRef.get(); // Get all visits, no ordering for now
                if (snapshot.empty) {
                    logger.info("No visits found in subcollection for patient", { patientId });
                    return res.status(404).send({ message: "No visits found in subcollection for this patient." });
                }

                const visits = [];
                snapshot.forEach(doc => {
                    visits.push({ id: doc.id, ...doc.data() });
                });
                
                logger.info(`Successfully retrieved ${visits.length} visits for patient.`, { patientId });
                return res.status(200).send(visits);

            } catch (error) {
                logger.error("Error retrieving visits for patient:", { patientId, errorMessage: error.message, errorStack: error.stack });
                return res.status(500).send({ error: "Internal Server Error retrieving visits.", details: error.message });
            }
        });
    }
);

// --- Function to Save a Patient Visit (Task: Print Report saves visit) ---
exports.savePatientVisit = onRequest(
    { region: 'us-central1', memory: '256MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for savePatientVisit", { method: req.method });
            if (req.method !== "POST") {
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            try {
                const { patientId, visitData } = req.body;

                if (!patientId) {
                    logger.warn("Bad Request: Missing patientId for savePatientVisit");
                    return res.status(400).send({ error: "Bad Request: Missing patientId." });
                }
                if (!visitData || typeof visitData !== 'object' || Object.keys(visitData).length === 0) {
                    logger.warn("Bad Request: Missing or empty visitData for savePatientVisit");
                    return res.status(400).send({ error: "Bad Request: Missing or invalid visitData." });
                }

                // Validate patient exists (optional, but good practice)
                const patientDocRef = db.collection('patients').doc(patientId);
                const patientDoc = await patientDocRef.get();
                if (!patientDoc.exists) {
                    logger.warn("Patient not found for savePatientVisit", { patientId });
                    return res.status(404).send({ error: "Patient not found. Cannot save visit." });
                }

                // Add a server timestamp to the visit data
                const now = FieldValue.serverTimestamp();
                visitData.createdAt = now;
                // If visitData includes a visitDate string, consider converting it to a Firestore Timestamp here
                // For example: if (visitData.visitDate && typeof visitData.visitDate === 'string') {
                //   visitData.visitDate = admin.firestore.Timestamp.fromDate(new Date(visitData.visitDate));
                // }

                const visitCollectionRef = patientDocRef.collection('visits');
                const newVisitRef = await visitCollectionRef.add(visitData);

                logger.info("Patient visit saved successfully.", { patientId: patientId, visitId: newVisitRef.id });
                return res.status(201).send({ success: true, visitId: newVisitRef.id, message: "Patient visit saved successfully." });

            } catch (error) {
                logger.error("Error saving patient visit to Firestore:", { errorMessage: error.message, errorStack: error.stack });
                return res.status(500).send({ error: "Internal Server Error saving patient visit.", details: error.message });
            }
        });
    }
);

// --- NEW Cloud Function to Add a Historical Visit (for bulk import script) ---
// Modifying for batch processing
exports.addHistoricalVisit = onRequest(
    { region: 'us-central1', memory: '512MB' }, // Increased memory for batch
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for addHistoricalVisit (batch)", { method: req.method });
            if (req.method !== "POST") {
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            const visitsArray = req.body.visits; // Expecting an array of { patientId, visitData }
            if (!visitsArray || !Array.isArray(visitsArray) || visitsArray.length === 0) {
                logger.warn("Bad Request: 'visits' array is required for addHistoricalVisit.");
                return res.status(400).json({ error: "Request body must be a non-empty array of visit objects under the 'visits' key, each with 'patientId' (PReg) and 'visitData'." });
            }

            logger.info(`addHistoricalVisit (batch) processing ${visitsArray.length} visits.`);
            const results = [];
            let successCount = 0;
            let failureCount = 0;
            const errors = [];
            const importTimestamp = admin.firestore.FieldValue.serverTimestamp(); // Use admin.firestore

            for (const item of visitsArray) {
                const { patientId, visitData } = item; // patientId is PReg from script

                if (!patientId || !visitData || typeof visitData !== 'object' || !visitData.visitDate) {
                    logger.warn("Skipping visit in batch due to missing patientId, visitData, or visitData.visitDate:", item);
                    failureCount++;
                    const pId = patientId || "N/A";
                    const vDate = (visitData && visitData.visitDate) ? visitData.visitDate : "N/A";
                    errors.push({ patientId: pId, visitDate: vDate, error: "Missing patientId, visitData, or visitData.visitDate" });
                    results.push({ patientId: pId, visitDate: vDate, status: "skipped", reason: "Missing patientId, visitData, or visitData.visitDate"});
                    continue;
                }

                try {
                    const patientDocRef = db.collection('patients').doc(patientId); // patientId from script is PReg (document ID)
                    // No need to explicitly check patientDoc.exists for adding to subcollection, 
                    // but for robustness in import, good to know if parent doesn't exist.
                    // However, function will still try to write to subcollection path.
                    // If parent doesn't exist, subcollection write creates the path but parent remains non-existent.
                    // For cleaner data, ensure patients are created first.
                    // The script does patients first, so this should be okay.

                    const dataToSave = {
                        ...visitData, 
                        pReg: patientId, // Store PReg in visit doc for convenience
                        importedAt: importTimestamp 
                    };

                    const visitCollectionRef = patientDocRef.collection('visits');
                    const newVisitRef = await visitCollectionRef.add(dataToSave);
                    
                    // logger.info("Historical patient visit saved successfully in batch.", { patientId: patientId, visitId: newVisitRef.id, historicalVisitDate: visitData.visitDate });
                    successCount++;
                    results.push({ patientId, visitDate: visitData.visitDate, visitId: newVisitRef.id, status: "created" });

                } catch (error) {
                    logger.error("Error saving historical patient visit in batch:", { patientId, visitDate: visitData.visitDate, errorMessage: error.message, errorStack: error.stack });
                    failureCount++;
                    errors.push({ patientId, visitDate: visitData.visitDate, error: error.message });
                    results.push({ patientId, visitDate: visitData.visitDate, status: "error", reason: error.message });
                }
            }

            logger.info(`Batch addHistoricalVisit finished. Success: ${successCount}, Failure: ${failureCount}`);
            if (failureCount > 0) {
                return res.status(207).json({ // Multi-Status
                    message: "Batch visit operation completed with some errors.",
                    successCount,
                    failureCount,
                    results,
                    errors
                });
            } else {
                return res.status(201).json({
                    message: "All visits in batch processed successfully.",
                    successCount,
                    failureCount: 0,
                    results
                });
            }
        });
    }
);

// --- NEW Cloud Function to Create a Single Patient (for UI) ---
exports.createPatient = onRequest(
    { region: 'us-central1', memory: '256MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for createPatient", { method: req.method });
            if (req.method !== "POST") {
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            try {
                const patientData = req.body;

                if (!patientData || typeof patientData !== 'object' || !patientData.name) {
                    logger.warn("Bad Request: Missing patient data or name for createPatient");
                    return res.status(400).send({ error: "Bad Request: Missing patient data or name." });
                }

                const counterRef = db.collection('_constants').doc('patientCounter');
                let newPRegNumber;

                // Transaction to get and update the counter
                await db.runTransaction(async (transaction) => {
                    const counterDoc = await transaction.get(counterRef);
                    if (!counterDoc.exists || !counterDoc.data().lastPRegNumber) {
                        newPRegNumber = 1; // Start from 1 if counter doesn't exist or field is missing
                    } else {
                        newPRegNumber = counterDoc.data().lastPRegNumber + 1;
                    }
                    transaction.set(counterRef, { lastPRegNumber: newPRegNumber }, { merge: true });
                });

                const newPReg = `PR-${newPRegNumber}`;
                const patientDocRef = db.collection('patients').doc(newPReg);
                const now = FieldValue.serverTimestamp();

                const dataToSave = {
                    ...patientData,
                    pReg: newPReg,
                    name_normalized: patientData.name ? patientData.name.trim().toLowerCase() : '',
                    isImported: false,
                    createdAt: now,
                    updatedAt: now
                };
                
                // Remove id if it was accidentally passed in the body for a new patient
                delete dataToSave.id;


                await patientDocRef.set(dataToSave);

                logger.info("New patient created successfully via UI.", { patientId: newPReg, pReg: newPReg });
                return res.status(201).send({ patientId: newPReg, message: "Patient created successfully." });

            } catch (error) {
                logger.error("Error creating new patient via UI:", { errorMessage: error.message, errorStack: error.stack });
                return res.status(500).send({ error: "Internal Server Error creating patient.", details: error.message });
            }
        });
    }
);

// --- NEW Cloud Function to Set Patient Counter ---
exports.setPatientCounter = onRequest(
    { region: 'us-central1', memory: '128MB' },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            logger.info("Request received for setPatientCounter", { method: req.method });
            if (req.method !== "POST") {
                return res.status(405).send({ error: "Method Not Allowed" });
            }

            try {
                const data = req.body;
                const lastPRegNumber = data.lastPRegNumber;

                if (typeof lastPRegNumber !== 'number' || lastPRegNumber < 0) {
                    logger.warn("Bad request to setPatientCounter: lastPRegNumber is invalid.", { data });
                    return res.status(400).send({ error: "Invalid lastPRegNumber. Must be a non-negative number." });
                }

                const counterRef = db.collection('_constants').doc('patientCounter');
                await counterRef.set({ lastPRegNumber: lastPRegNumber }, { merge: true });

                logger.info(`Patient counter successfully set to ${lastPRegNumber}.`);
                res.status(200).send({ success: true, message: `Patient counter set to ${lastPRegNumber}.` });

            } catch (error) {
                logger.error("Error in setPatientCounter:", { error: error.message, stack: error.stack });
                res.status(500).send({ error: "Internal Server Error setting patient counter.", details: error.message });
            }
        });
    }
);
