import csv
import json
import http.client
import time # For potential rate limiting
from collections import defaultdict # New import

CSV_FILE_PATH = "/Users/areebbajwa/Downloads/ClinicData.xlsx - Sheet1.csv"

# --- Target Live Firebase Functions ---
LIVE_FUNCTIONS_HOST = "us-central1-theneuron-ac757.cloudfunctions.net"
CREATE_PATIENT_FUNCTION_PATH = "/createPatient"  # Path only, host contains project/region
ADD_HISTORICAL_VISIT_FUNCTION_PATH = "/addHistoricalVisit" # Path only

def import_patients():
    processed_pregs = set()
    patients_imported_count = 0
    patients_skipped_count = 0
    failed_imports = []

    print(f"Starting patient import from: {CSV_FILE_PATH}")
    # print(f"Targeting Patient Creation Cloud Function at: http://{EMULATOR_HOST}{CREATE_PATIENT_FUNCTION_PATH}")
    print(f"Targeting Patient Creation Cloud Function at: https://{LIVE_FUNCTIONS_HOST}{CREATE_PATIENT_FUNCTION_PATH}")

    try:
        with open(CSV_FILE_PATH, mode='r', encoding='utf-8-sig') as csvfile: # utf-8-sig to handle potential BOM
            reader = csv.DictReader(csvfile)
            
            if not reader.fieldnames:
                print("Error: CSV file appears to be empty or header is missing for patient import.")
                return

            # expected_headers = ['PReg', 'Name', 'Age', 'YMD', 'Sex', 'TToken', 'ContNo', 'NICno', 'FName', 'Address', 'Date', 'UserID']
            # Check only for absolutely critical headers for now
            critical_headers = ['PReg', 'Name'] 
            missing_critical = [h for h in critical_headers if h not in reader.fieldnames]
            if missing_critical:
                print(f"Error: Critical CSV headers are missing for patient import: {', '.join(missing_critical)}. Cannot proceed.")
                return

            conn = None # Initialize connection

            for row_index, row in enumerate(reader):
                preg = row.get('PReg', '').strip()

                if not preg:
                    # print(f"Skipping row {row_index + 2} due to missing PReg.")
                    patients_skipped_count += 1
                    continue

                if preg in processed_pregs:
                    # This PReg's first occurrence has been processed for demographics
                    # We don't skip the row from overall processing for visits, but we skip demographic creation.
                    continue 
                
                patient_name = row.get('Name', '').strip()
                if not patient_name:
                    print(f"Skipping PReg {preg} (row {row_index + 2}) for demographic import due to missing Name.")
                    # patients_skipped_count += 1 # This might double count skips if we count them in visit phase too.
                    continue

                name_normalized = patient_name.lower() # Already stripped

                # Construct patient_data only once per unique PReg
                patient_data = {
                    "pReg": preg,
                    "name": patient_name,
                    "name_normalized": name_normalized, 
                    "ageLastRecorded": row.get('Age', '').strip(),
                    "ageUnitLastRecorded": row.get('YMD', '').strip(),
                    "sex": row.get('Sex', '').strip(),
                    "tToken": row.get('TToken', '').strip(),
                    "contactNo": row.get('ContNo', '').strip() if row.get('ContNo', 'NULL') != 'NULL' else '',
                    "nicNo": row.get('NICno', '').strip() if row.get('NICno', 'NULL') != 'NULL' else '',
                    "fatherName": row.get('FName', '').strip() if row.get('FName', 'NULL') != 'NULL' else '',
                    "address": row.get('Address', '').strip(),
                    "dateOfRecording": row.get('Date', '').strip(), # Date of first record for this patient
                    "recordedByUserId": row.get('UserID', '').strip(),
                    "isImported": True
                }
                
                headers = {'Content-type': 'application/json'}
                json_payload = json.dumps(patient_data)

                try:
                    if conn is None: 
                         # conn = http.client.HTTPConnection(EMULATOR_HOST, timeout=10)
                         conn = http.client.HTTPSConnection(LIVE_FUNCTIONS_HOST, timeout=20) # Use HTTPS for live
                    
                    conn.request("POST", CREATE_PATIENT_FUNCTION_PATH, json_payload, headers)
                    response = conn.getresponse()
                    response_body = response.read().decode()

                    if response.status == 201:
                        print(f"SUCCESS (Demographics): Imported PReg: {preg}, Name: {patient_name} (Row {row_index + 2})")
                        patients_imported_count += 1
                        processed_pregs.add(preg) # Add to set only on successful demographic import
                    else:
                        print(f"FAILED (Demographics): PReg: {preg} (Row {row_index + 2}). Status: {response.status}, Response: {response_body}")
                        failed_imports.append({"pReg": preg, "type": "demographic", "name": patient_name, "status": response.status, "response": response_body})
                    
                    response.close() 

                except http.client.HTTPException as e: 
                    print(f"HTTP ERROR (Demographics) for PReg {preg} (Row {row_index + 2}): {e}")
                    failed_imports.append({"pReg": preg, "type": "demographic", "name": patient_name, "error": str(e)})
                    if conn:
                        conn.close()
                    conn = None 
                    time.sleep(1) 
                except ConnectionRefusedError as e:
                     print(f"FATAL (Demographics): Connection Refused or Unreachable. Check live Function URL and internet: https://{LIVE_FUNCTIONS_HOST}{CREATE_PATIENT_FUNCTION_PATH}. Error: {e}")
                     print("Aborting demographic import.")
                     if conn: conn.close()
                     return # Stop if functions aren't reachable
                except Exception as e:
                    print(f"GENERAL ERROR (Demographics) for PReg {preg} (Row {row_index + 2}): {e}")
                    failed_imports.append({"pReg": preg, "type": "demographic", "name": patient_name, "error": str(e)})
                    if conn: 
                        conn.close()
                    conn = None 
                    time.sleep(0.5) 

            if conn:
                conn.close()

    except FileNotFoundError:
        print(f"FATAL Error: CSV file not found at {CSV_FILE_PATH} for demographic import.")
        return # Return if file not found, so visit import isn't attempted
    except Exception as e:
        print(f"An unexpected error occurred during demographic file processing or setup: {e}")
        return

    print(f"\\n--- Patient Demographic Import Summary ---")
    print(f"Successfully created/updated patient demographics: {patients_imported_count}")
    print(f"Rows skipped during demographic scan (e.g. missing PReg/Name, already processed PReg for demographics): {patients_skipped_count}") # This count might be high if many rows per patient
    print(f"Failed demographic imports: {len([f for f in failed_imports if f.get('type') == 'demographic'])}")
    if any(f for f in failed_imports if f.get('type') == 'demographic'):
        print("Details of failed demographic imports:")
        for failure in failed_imports:
            if failure.get('type') == 'demographic':
                print(f"  - PReg: {failure.get('pReg', 'N/A')}, Name: {failure.get('name', 'N/A')}, Reason: {failure.get('status', failure.get('error', 'Unknown'))}")
        print("You may need to check the Firebase Functions emulator logs for more details on these failures.")

def import_historical_visits():
    print("\\n--- Starting Historical Visit Import ---")
    # print(f"Targeting Add Historical Visit Cloud Function at: http://{EMULATOR_HOST}{ADD_HISTORICAL_VISIT_FUNCTION_PATH}")
    print(f"Targeting Add Historical Visit Cloud Function at: https://{LIVE_FUNCTIONS_HOST}{ADD_HISTORICAL_VISIT_FUNCTION_PATH}")
    
    visits_to_process = defaultdict(lambda: {"details": None, "medications": []})
    all_csv_rows = [] # To store all rows from CSV for visit processing

    try:
        with open(CSV_FILE_PATH, mode='r', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            if not reader.fieldnames:
                print("Error: CSV file for visit import appears to be empty or header is missing.")
                return
            all_csv_rows = list(reader) # Read all rows into memory
            
    except FileNotFoundError:
        print(f"FATAL Error: CSV file not found at {CSV_FILE_PATH} for visit import.")
        return
    except Exception as e:
        print(f"An unexpected error occurred during CSV file reading for visits: {e}")
        return

    if not all_csv_rows:
        print("No data rows found in CSV for visit import.")
        return

    # Group rows by (PReg, Date) and extract visit details + medications
    for row in all_csv_rows:
        preg = row.get('PReg', '').strip()
        visit_date_str = row.get('Date', '').strip() # This is like "24:35.0"

        if not preg or not visit_date_str:
            # print(f"Skipping row for visit processing due to missing PReg or Date: {row}")
            continue 

        visit_key = (preg, visit_date_str)

        if visits_to_process[visit_key]["details"] is None:
            visits_to_process[visit_key]["details"] = {
                "visitDate": visit_date_str, 
                "complaints": row.get('Complain', '').strip(),
                "examination": row.get('Examination', '').strip(),
                "diagnosis": row.get('Diagnose', '').strip(),
                "investigation": row.get('Investigation', '').strip(),
                "advise": row.get('Advise', '').strip(),
                "nextPlan": row.get('NextPlan', '').strip(),
                # Assuming 'Code' might be the 'tToken' or similar for the visit context, if needed.
                # For now, we are not adding 'Code' from the main report page's 'Code' field.
                # If 'dToken' or 'SNo' (the one next to CO) is the visit "Code", it can be added here.
                # e.g. "visitCode": row.get('dToken', '').strip() or row.get('SNo', '').strip()
            }

        med_name = row.get('MName', '').strip()
        if med_name: 
            visits_to_process[visit_key]["medications"].append({
                "name": med_name,
                "instructions": row.get('DoseInstruc', '').strip(),
                "duration": row.get('DoseforDay', '').strip()
            })

    print(f"Identified {len(visits_to_process)} unique historical visits to process.")
    
    imported_visits_count = 0
    failed_visits_details = [] # Store details of failed visit imports
    conn = None

    for (preg, visit_date_str), visit_data_parts in visits_to_process.items():
        if visit_data_parts["details"] is None: 
            continue

        full_visit_data = {
            **visit_data_parts["details"],
            "medications": visit_data_parts["medications"]
        }
        
        # Prepare payload for the addHistoricalVisit Cloud Function
        payload_for_cf = {
            "patientId": preg, 
            "visitData": full_visit_data
        }
        json_payload_for_cf = json.dumps(payload_for_cf)
        headers = {'Content-type': 'application/json'}

        try:
            if conn is None:
                # conn = http.client.HTTPConnection(EMULATOR_HOST, timeout=10)
                conn = http.client.HTTPSConnection(LIVE_FUNCTIONS_HOST, timeout=20) # Use HTTPS for live
            
            conn.request("POST", ADD_HISTORICAL_VISIT_FUNCTION_PATH, json_payload_for_cf, headers)
            response = conn.getresponse()
            response_body = response.read().decode()

            if response.status == 201 or response.status == 200: 
                # print(f"SUCCESS (Visit): PReg: {preg}, VisitDate: {visit_date_str}")
                imported_visits_count += 1
            else:
                print(f"FAILED (Visit): PReg: {preg}, VisitDate: {visit_date_str}. Status: {response.status}, Resp: {response_body}")
                failed_visits_details.append({"pReg": preg, "visitDate": visit_date_str, "status": response.status, "response": response_body})
            
            response.close()

        except http.client.HTTPException as e:
            print(f"HTTP ERROR (Visit) for PReg {preg}, Date {visit_date_str}: {e}")
            failed_visits_details.append({"pReg": preg, "visitDate": visit_date_str, "error_type": "HTTPException", "error": str(e)})
            if conn:
                conn.close()
            conn = None
            time.sleep(1)
        except ConnectionRefusedError: # No 'as e' needed if not using e
            # print(f"FATAL (Visit Import): Connection Refused. Ensure Firebase emulators (Functions) are running at http://{EMULATOR_HOST}. Aborting visit import.")
            print(f"FATAL (Visit Import): Connection Refused or Unreachable. Check live Function URL and internet: https://{LIVE_FUNCTIONS_HOST}{ADD_HISTORICAL_VISIT_FUNCTION_PATH}. Aborting visit import.")
            if conn: conn.close()
            return # Stop if functions aren't reachable
        except Exception as e:
            print(f"GENERAL ERROR (Visit) for PReg {preg}, Date {visit_date_str}: {e}")
            failed_visits_details.append({"pReg": preg, "visitDate": visit_date_str, "error_type": "GeneralException", "error": str(e)})
            if conn:
                conn.close()
            conn = None
            time.sleep(0.5)
        
        if imported_visits_count > 0 and imported_visits_count % 100 == 0:
             print(f"Processed {imported_visits_count} visits so far...")
        # time.sleep(0.01) # Small delay if needed

    if conn:
        conn.close()

    print(f"\\n--- Historical Visit Import Summary ---")
    print(f"Attempted to import visits for {len(visits_to_process)} unique (PReg, Date) combinations.")
    print(f"Successfully imported visits: {imported_visits_count}")
    print(f"Failed visit imports: {len(failed_visits_details)}")
    if failed_visits_details:
        print("Details of failed visit imports:")
        for failure in failed_visits_details:
            print(f"  - PReg: {failure['pReg']}, VisitDate: {failure['visitDate']}, Reason: {failure.get('status', failure.get('error', 'Unknown'))}")

if __name__ == "__main__":
    print("--- Starting Full Data Import Process ---")
    
    # Step 1: Import patient demographics
    print("\\nSTEP 1: Importing Patient Demographics...")
    import_patients() 
    
    # Step 2: Import historical visits
    print("\\nSTEP 2: Importing Historical Visits...")
    import_historical_visits()

    print("\\n--- Full Data Import Process Finished ---") 