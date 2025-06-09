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
    const searchPatientsFunctionUrl = "https://searchpatients-pzytr7bzwa-uc.a.run.app";
    const createPatientFunctionUrl = "https://createpatient-pzytr7bzwa-uc.a.run.app";
    const updatePatientFunctionUrl = "https://updatepatient-pzytr7bzwa-uc.a.run.app"; 
    const deletePatientFunctionUrl = "https://deletepatient-pzytr7bzwa-uc.a.run.app"; 

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
            // For initial load, fetch a limited number of patients or based on a default query
            // The searchPatients function expects a query 'q'. An empty 'q' might not be ideal.
            // Let's use a wildcard or a very common letter, or assume the function handles empty q gracefully for a list.
            // For now, let's assume an empty query string fetches a list or the most recent ones (up to default limit in CF).
            // Or, we can specify a large limit if we want to get more initially.
            const response = await fetch(`${searchPatientsFunctionUrl}?q=${encodeURIComponent(query)}&limit=50`); // Fetch up to 50 for initial list
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error fetching patients:', response.statusText, errorText);
                alert(`Error fetching patients: ${response.statusText}`);
                showLoading(false);
                showNoPatientsMessage(true);
                return;
            }
            const patients = await response.json();
            if (patients.length === 0) {
                showNoPatientsMessage(true);
            } else {
                patients.forEach(renderPatientRow);
            }
        } catch (error) {
            console.error('Error fetching patients:', error);
            alert(`Failed to load patients: ${error.message}`);
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
            alert('Patient name is required.');
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
            alert(`Patient ${currentEditPatientId ? 'updated' : 'saved'} successfully! ID: ${result.patientId || currentEditPatientId}`);
            hidePatientForm();
            fetchAndDisplayPatients(searchInput.value.trim()); // Refresh list with current search or all
        } catch (error) {
            console.error('Error saving patient:', error);
            alert(`Error saving patient: ${error.message}`);
        }
    }

    async function deletePatientHandler(patientId, patientName) {
        if (!confirm(`Are you sure you want to delete patient: ${patientName} (ID: ${patientId})?`)) {
            return;
        }

        try {
            // Assuming deletePatient CF expects ID in the URL path
            const response = await fetch(`${deletePatientFunctionUrl}/${patientId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorResult = await response.json().catch(() => ({ error: 'Unknown server error' }));
                throw new Error(errorResult.error || `Server error: ${response.status}`);
            }

            alert(`Patient ${patientName} deleted successfully.`);
            fetchAndDisplayPatients(searchInput.value.trim()); // Refresh list
        } catch (error) {
            console.error('Error deleting patient:', error);
            alert(`Error deleting patient: ${error.message}`);
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

    // --- Initial Load ---
    fetchAndDisplayPatients(); // Load initial patient list

}); 