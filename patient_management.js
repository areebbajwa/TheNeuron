document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const searchInput = document.getElementById('searchInput');
    const addPatientBtn = document.getElementById('addPatientBtn');
    const patientFormContainer = document.getElementById('patientFormContainer');
    const patientForm = document.getElementById('patientForm');
    const formTitle = document.getElementById('formTitle');
    const cancelPatientBtn = document.getElementById('cancelPatientBtn');
    const patientTableBody = document.getElementById('patientTableBody');
    const loadingMessage = document.getElementById('loadingMessage');
    const noPatientsMessage = document.getElementById('noPatientsMessage');

    // Financial report elements
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const showTotalChargedBtn = document.getElementById('showTotalChargedBtn');
    const totalChargedResultP = document.getElementById('totalChargedResult');

    // Input fields in the form
    const patientIdField = document.getElementById('patientId');
    const pRegForm = document.getElementById('pRegForm');
    const nameForm = document.getElementById('nameForm');
    const ageForm = document.getElementById('ageForm');
    const ageUnitForm = document.getElementById('ageUnitForm');
    const genderForm = document.getElementById('genderForm');
    const contactNoForm = document.getElementById('contactNoForm');
    const nicNoForm = document.getElementById('nicNoForm');
    const occupationForm = document.getElementById('occupationForm');
    const addressForm = document.getElementById('addressForm');

    // --- Firebase Cloud Function URLs ---
    const useEmulator = false; // <--- SET TO true FOR EMULATOR, false FOR PRODUCTION

    const prodProjectId = "theneuron-ac757";
    const prodRegion = "us-central1";
    // Base URL for production functions (adjust if your URLs differ, e.g. Cloud Run v2 unique URLs)
    // const prodBaseUrl = `https://${prodRegion}-${prodProjectId}.cloudfunctions.net`;

    const localProjectId = "theneuron-ac757";
    const localRegion = "us-central1";
    const localBaseUrl = "http://localhost:5002/theneuron-ac757/us-central1";

    // Define production URLs directly if they have unique hostnames or complex paths
    const prodSearchPatientsFunctionUrl = "https://searchpatients-pzytr7bzwa-uc.a.run.app";
    const prodCreatePatientFunctionUrl = "https://createpatient-pzytr7bzwa-uc.a.run.app";
    const prodUpdatePatientFunctionUrl = "https://updatepatient-pzytr7bzwa-uc.a.run.app";
    const prodDeletePatientFunctionUrl = "https://deletepatient-pzytr7bzwa-uc.a.run.app";
    const prodGetPatientVisitSummaryFunctionUrl = "https://us-central1-theneuron-ac757.cloudfunctions.net/getPatientVisitSummary";
    const prodGetTotalChargedInDateRangeFunctionUrl = "https://us-central1-theneuron-ac757.cloudfunctions.net/getTotalChargedInDateRange";

    const searchPatientsFunctionUrl = useEmulator ? `${localBaseUrl}/searchPatients` : prodSearchPatientsFunctionUrl;
    const createPatientFunctionUrl = useEmulator ? `${localBaseUrl}/createPatient` : prodCreatePatientFunctionUrl;
    const updatePatientFunctionUrl = useEmulator ? `${localBaseUrl}/updatePatient` : prodUpdatePatientFunctionUrl;
    const deletePatientFunctionUrl = useEmulator ? `${localBaseUrl}/deletePatient` : prodDeletePatientFunctionUrl;
    const getPatientVisitSummaryFunctionUrl = useEmulator ? `${localBaseUrl}/getPatientVisitSummary` : prodGetPatientVisitSummaryFunctionUrl;
    const getTotalChargedInDateRangeFunctionUrl = useEmulator ? `${localBaseUrl}/getTotalChargedInDateRange` : prodGetTotalChargedInDateRangeFunctionUrl;

    let currentEditPatientId = null; // To store ID of patient being edited

    // --- Functions ---
    function showLoading(show) {
        if (loadingMessage) loadingMessage.style.display = show ? 'block' : 'none';
    }

    function showNoPatientsMessage(show) {
        if (noPatientsMessage) noPatientsMessage.style.display = show ? 'block' : 'none';
    }

    function clearPatientTable() {
        if (patientTableBody) patientTableBody.innerHTML = '';
    }

    function renderPatientRow(patient) {
        const row = patientTableBody.insertRow();
        row.setAttribute('data-id', patient.id); // Store Firestore ID

        row.insertCell().textContent = patient.pReg || 'N/A';
        row.insertCell().textContent = patient.name || 'N/A';
        row.insertCell().textContent = patient.ageLastRecorded ? `${patient.ageLastRecorded} ${patient.ageUnitLastRecorded || ''}`.trim() : 'N/A';
        row.insertCell().textContent = patient.sex || 'N/A';
        row.insertCell().textContent = patient.contactNo || 'N/A';
        row.insertCell().textContent = patient.nicNo || 'N/A';
        row.insertCell().textContent = patient.fatherName || 'N/A'; // This is Occupation
        row.insertCell().textContent = patient.lastVisitDate ? new Date(patient.lastVisitDate).toLocaleDateString() : 'N/A';
        row.insertCell().textContent = typeof patient.lastAmountCharged === 'number' ? patient.lastAmountCharged.toLocaleString() : 'N/A';
        
        const actionsCell = row.insertCell();
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.classList.add('edit-btn');
        editButton.addEventListener('click', () => loadPatientForEdit(patient));
        actionsCell.appendChild(editButton);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.classList.add('delete-btn');
        deleteButton.addEventListener('click', () => deletePatientHandler(patient.id, patient.name));
        actionsCell.appendChild(deleteButton);
    }

    async function fetchAndDisplayPatients(query = '') {
        clearPatientTable();
        showLoading(true);
        showNoPatientsMessage(false);

        try {
            const response = await fetch(`${searchPatientsFunctionUrl}?q=${encodeURIComponent(query)}&limit=50`); 
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error fetching patients:', response.statusText, errorText);
                console.log(`Error fetching patients: ${response.statusText}`);
                showLoading(false);
                showNoPatientsMessage(true);
                return;
            }
            let patients = await response.json();
            if (patients.length === 0) {
                showNoPatientsMessage(true);
            } else {
                // Fetch visit summaries for each patient
                const patientPromises = patients.map(async (patient) => {
                    try {
                        const summaryRes = await fetch(`${getPatientVisitSummaryFunctionUrl}?patientId=${patient.id}`);
                        if (summaryRes.ok) {
                            const summary = await summaryRes.json();
                            return { ...patient, ...summary }; // Combine patient data with summary
                        } else {
                            console.warn(`Could not fetch visit summary for ${patient.id}: ${summaryRes.statusText}`);
                            return { ...patient, lastVisitDate: null, lastAmountCharged: null }; // Default if fetch fails
                        }
                    } catch (summaryError) {
                        console.error(`Error fetching visit summary for ${patient.id}:`, summaryError);
                        return { ...patient, lastVisitDate: null, lastAmountCharged: null }; // Default on error
                    }
                });
                patients = await Promise.all(patientPromises);
                patients.forEach(renderPatientRow);
            }
        } catch (error) {
            console.error('Error fetching patients:', error);
            console.log(`Failed to load patients: ${error.message}`);
            showNoPatientsMessage(true);
        } finally {
            showLoading(false);
        }
    }

    function showPatientForm(isEditMode = false, patientData = null) {
        patientForm.reset();
        currentEditPatientId = null;
        patientIdField.value = '';
        pRegForm.readOnly = isEditMode; // PReg generally shouldn't be edited once set

        if (isEditMode && patientData) {
            formTitle.textContent = 'Edit Patient';
            currentEditPatientId = patientData.id;
            patientIdField.value = patientData.id;

            pRegForm.value = patientData.pReg || '';
            nameForm.value = patientData.name || '';
            ageForm.value = patientData.ageLastRecorded || '';
            ageUnitForm.value = patientData.ageUnitLastRecorded || '';
            genderForm.value = patientData.sex || '';
            contactNoForm.value = patientData.contactNo || '';
            nicNoForm.value = patientData.nicNo || '';
            occupationForm.value = patientData.fatherName || ''; // This is Occupation
            addressForm.value = patientData.address || '';
        } else {
            formTitle.textContent = 'Add New Patient';
            pRegForm.value = ''; // Clear PReg for new patient, will be auto-generated
            pRegForm.readOnly = true; // PReg is auto-generated
        }
        patientFormContainer.style.display = 'block';
    }

    function hidePatientForm() {
        patientFormContainer.style.display = 'none';
        patientForm.reset();
        currentEditPatientId = null;
    }

    function loadPatientForEdit(patient) {
        // The patient object passed here should have all necessary fields from the table/fetch
        showPatientForm(true, patient);
    }

    async function savePatientHandler(event) {
        event.preventDefault();
        const patientData = {
            name: nameForm.value.trim(),
            ageLastRecorded: ageForm.value.trim(),
            ageUnitLastRecorded: ageUnitForm.value.trim(),
            sex: genderForm.value,
            contactNo: contactNoForm.value.trim(),
            nicNo: nicNoForm.value.trim(),
            fatherName: occupationForm.value.trim(), // This is Occupation
            address: addressForm.value.trim(),
            // pReg is handled by the backend for new patients or should not be changed for existing ones easily
            // isImported: false (will be set by CF if new)
        };

        if (!patientData.name) {
            console.warn('Patient name is required.');
            return;
        }

        let url = createPatientFunctionUrl;
        let method = 'POST';

        if (currentEditPatientId) {
            url = `${updatePatientFunctionUrl}/${currentEditPatientId}`; // Or how your update CF expects it
            method = 'PUT'; // Or POST if your CF expects that for updates
            patientData.id = currentEditPatientId; // Send ID for update
        } else {
             // For new patients, if pRegForm is not empty and user intended to use it, send it.
             // Otherwise, CF will generate it.
             const pRegManual = pRegForm.value.trim();
             if (pRegManual) patientData.pReg = pRegManual;
        }

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patientData)
            });

            if (!response.ok) {
                const errorResult = await response.json().catch(() => ({ error: 'Unknown server error' }));
                throw new Error(errorResult.error || `Server error: ${response.status}`);
            }
            
            const result = await response.json();
            console.log(`Patient ${currentEditPatientId ? 'updated' : 'saved'} successfully! ID: ${result.patientId || currentEditPatientId}`);
            hidePatientForm();
            fetchAndDisplayPatients(searchInput.value.trim()); // Refresh list with current search or all
        } catch (error) {
            console.error('Error saving patient:', error);
            console.log(`Error saving patient: ${error.message}`);
        }
    }

    async function deletePatientHandler(patientId, patientName) {
        if (!confirm(`Are you sure you want to delete patient: ${patientName} (ID: ${patientId})?`)) {
            return;
        }

        try {
            // Assuming deletePatient CF expects ID in the URL path -- CORRECTING THIS ASSUMPTION
            const response = await fetch(`${deletePatientFunctionUrl}?id=${patientId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorResult = await response.json().catch(() => ({ error: 'Unknown server error' }));
                throw new Error(errorResult.error || `Server error: ${response.status}`);
            }

            console.log(`Patient ${patientName} deleted successfully.`);
            fetchAndDisplayPatients(searchInput.value.trim()); // Refresh list
        } catch (error) {
            console.error('Error deleting patient:', error);
            console.log(`Error deleting patient: ${error.message}`);
        }
    }
    
    // --- Event Listeners ---
    if (addPatientBtn) {
        addPatientBtn.addEventListener('click', () => showPatientForm());
    }
    if (cancelPatientBtn) {
        cancelPatientBtn.addEventListener('click', hidePatientForm);
    }
    if (patientForm) {
        patientForm.addEventListener('submit', savePatientHandler);
    }
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            // Debounce search a bit
            // For now, simple direct search
            fetchAndDisplayPatients(e.target.value.trim());
        });
    }

    // Financial Report Logic
    function setDateDefaults() {
        const today = new Date().toISOString().split('T')[0];
        if (startDateInput) startDateInput.value = today;
        if (endDateInput) endDateInput.value = today;
    }

    async function handleShowTotalCharged() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) {
            console.warn('Please select both start and end dates.');
            if(totalChargedResultP) { 
                totalChargedResultP.textContent = 'Please select both start and end dates.';
                totalChargedResultP.style.display = 'block';
            }
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            console.warn('Start date cannot be after end date.');
            if(totalChargedResultP) { 
                totalChargedResultP.textContent = 'Start date cannot be after end date.';
                totalChargedResultP.style.display = 'block';
            }
            return;
        }

        totalChargedResultP.textContent = 'Calculating...';
        totalChargedResultP.style.display = 'block';

        try {
            const response = await fetch(`${getTotalChargedInDateRangeFunctionUrl}?startDate=${startDate}&endDate=${endDate}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to fetch total.' }));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            const result = await response.json();
            totalChargedResultP.textContent = `Total Amount Charged (${result.startDate} to ${result.endDate}): ${result.totalAmount.toLocaleString()} (from ${result.visitCount} visits)`;
        } catch (error) {
            console.error('Error fetching total charged:', error);
            totalChargedResultP.textContent = `Error: ${error.message}`;
        }
    }

    if (showTotalChargedBtn) {
        showTotalChargedBtn.addEventListener('click', handleShowTotalCharged);
    }

    // --- Initial Load ---
    setDateDefaults(); // Set default dates for financial report
    fetchAndDisplayPatients(); // Load initial patient list

}); 