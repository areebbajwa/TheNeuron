import csv
import json
import http.client
import time # For potential rate limiting
from collections import defaultdict
import re # For extracting PReg number

CSV_FILE_PATH = "/Users/areebbajwa/Downloads/ClinicData.xlsx - Sheet1.csv"

# --- Target Live Firebase Functions ---
LIVE_FUNCTIONS_HOST = "us-central1-theneuron-ac757.cloudfunctions.net"
# The script uses HTTP POST, so these are paths for HTTP functions.
# The createPatientHttp function was designed for this script.
CREATE_PATIENT_FUNCTION_PATH = "/createPatientHttp"
ADD_HISTORICAL_VISIT_FUNCTION_PATH = "/addHistoricalVisit"
SET_PATIENT_COUNTER_FUNCTION_PATH = "/setPatientCounter" # New path

BATCH_SIZE = 50

def send_batch_request(conn, host, path, payload_key, batch_data, headers):
    """Helper function to send a batch request and handle response."""
    json_payload = json.dumps({payload_key: batch_data})
    # print(f"Sending batch of {len(batch_data)} to {path}. Payload size: {len(json_payload)} bytes")
    try:
        if conn is None:
            conn = http.client.HTTPSConnection(host, timeout=60) # Increased timeout for larger batches
        
        conn.request("POST", path, json_payload, headers)
        response = conn.getresponse()
        response_body = response.read().decode()
        response.close()
        return response.status, response_body, conn
    except http.client.HTTPException as e:
        print(f"HTTP ERROR sending batch to {path}: {e}")
        if conn: conn.close()
        return None, None, None # Indicate connection needs reset
    except ConnectionRefusedError as e:
        print(f"FATAL: Connection Refused for {host}{path}. Error: {e}")
        if conn: conn.close()
        return "CONN_REFUSED", None, None
    except Exception as e:
        print(f"GENERAL ERROR sending batch to {path}: {e}")
        if conn: conn.close()
        return None, None, None

def update_pReg_counter_in_firestore(max_preg_number):
    print(f"\nAttempting to update Firestore patient counter to: {max_preg_number}")
    if max_preg_number <= 0:
        print("Invalid max_preg_number, skipping counter update.")
        return

    conn = None
    headers = {'Content-type': 'application/json'}
    payload = json.dumps({"lastPRegNumber": max_preg_number})

    try:
        conn = http.client.HTTPSConnection(LIVE_FUNCTIONS_HOST, timeout=30)
        conn.request("POST", SET_PATIENT_COUNTER_FUNCTION_PATH, payload, headers)
        response = conn.getresponse()
        response_body = response.read().decode()
        
        if response.status == 200:
            print(f"Successfully set patient counter: {response_body}")
        else:
            print(f"Error setting patient counter. Status: {response.status}, Response: {response_body}")
        response.close()
    except http.client.HTTPException as e:
        print(f"HTTP ERROR updating patient counter: {e}")
    except ConnectionRefusedError as e:
        print(f"FATAL: Connection Refused for {LIVE_FUNCTIONS_HOST}{SET_PATIENT_COUNTER_FUNCTION_PATH}. Error: {e}")
    except Exception as e:
        print(f"GENERAL ERROR updating patient counter: {e}")
    finally:
        if conn: conn.close()

def import_patients():
    processed_pregs_for_demographics = set()
    patients_processed_count = 0 # Counts PRegs sent for demographic creation/check
    patients_successfully_created_or_existing = 0
    overall_failed_patient_batches = 0
    detailed_failures = []
    max_preg_val_from_csv = 0 # To store the highest PReg number

    print(f"Starting patient import from: {CSV_FILE_PATH}")
    print(f"Targeting Patient Creation Cloud Function (batch) at: https://{LIVE_FUNCTIONS_HOST}{CREATE_PATIENT_FUNCTION_PATH}")
    print(f"Using BATCH_SIZE: {BATCH_SIZE}")

    patient_batch = []
    conn = None
    headers = {'Content-type': 'application/json'}

    try:
        with open(CSV_FILE_PATH, mode='r', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            if not reader.fieldnames: # Basic CSV check
                print("Error: CSV file for patient import appears to be empty or header is missing.")
                return

            for row_index, row in enumerate(reader):
                preg = row.get('PReg', '').strip()
                if not preg:
                    continue # Skip rows with no PReg
                
                # Extract numerical part of PReg for counter update
                match = re.match(r"PR-(\d+)", preg, re.IGNORECASE)
                if match:
                    preg_num = int(match.group(1))
                    if preg_num > max_preg_val_from_csv:
                        max_preg_val_from_csv = preg_num
                elif preg.isdigit(): # Handle cases like just "5786" if they exist and are valid for max count
                    preg_num = int(preg)
                    if preg_num > max_preg_val_from_csv:
                         max_preg_val_from_csv = preg_num

                # Process demographics only once per PReg
                if preg in processed_pregs_for_demographics:
                    continue
                
                patient_name = row.get('Name', '').strip()
                if not patient_name:
                    print(f"Skipping PReg {preg} (row {row_index + 2}) for demographic import due to missing Name.")
                    continue

                patient_data = {
                    "pReg": preg,
                    "name": patient_name,
                    "name_normalized": patient_name.lower().strip(), 
                    "ageLastRecorded": row.get('Age', '').strip(),
                    "ageUnitLastRecorded": row.get('YMD', '').strip(),
                    "sex": row.get('Sex', '').strip(),
                    "tToken": row.get('TToken', '').strip(),
                    "contactNo": row.get('ContNo', '').strip() if row.get('ContNo', 'NULL') != 'NULL' else '',
                    "nicNo": row.get('NICno', '').strip() if row.get('NICno', 'NULL') != 'NULL' else '',
                    "fatherName": row.get('FName', '').strip() if row.get('FName', 'NULL') != 'NULL' else '', # Occupation
                    "address": row.get('Address', '').strip(),
                    "dateOfRecording": row.get('Date', '').strip(),
                    "recordedByUserId": row.get('UserID', '').strip(),
                    "isImported": True
                }
                patient_batch.append(patient_data)
                processed_pregs_for_demographics.add(preg)
                patients_processed_count +=1

                if len(patient_batch) >= BATCH_SIZE:
                    print(f"Sending batch of {len(patient_batch)} patients (Total processed so far: {patients_processed_count})...")
                    status, body, conn = send_batch_request(conn, LIVE_FUNCTIONS_HOST, CREATE_PATIENT_FUNCTION_PATH, "patients", patient_batch, headers)
                    if status == "CONN_REFUSED": return
                    if status and (status == 201 or status == 207): # 201 all created, 207 mixed results
                        try:
                            response_data = json.loads(body)
                            patients_successfully_created_or_existing += response_data.get("successCount", 0)
                            if response_data.get("failureCount", 0) > 0:
                                print(f"  Batch had {response_data.get('failureCount',0)} failures. Details: {response_data.get('errors', [])}")
                                detailed_failures.extend(response_data.get('errors', []))
                            # print(f"  Batch response: {response_data.get('message', '')}")
                        except json.JSONDecodeError:
                            print(f"  ERROR decoding batch response: {body}")
                            overall_failed_patient_batches += 1
                    elif status is not None:
                        print(f"  ERROR in patient batch. Status: {status}, Response: {body}")
                        overall_failed_patient_batches += 1
                    patient_batch = [] # Reset batch
                    if conn is None and status is not None and status != "CONN_REFUSED" : time.sleep(1) # If connection was reset, pause

            # Send any remaining patients
            if patient_batch:
                print(f"Sending final batch of {len(patient_batch)} patients...")
                status, body, conn = send_batch_request(conn, LIVE_FUNCTIONS_HOST, CREATE_PATIENT_FUNCTION_PATH, "patients", patient_batch, headers)
                if status == "CONN_REFUSED": return
                if status and (status == 201 or status == 207):
                    try:
                        response_data = json.loads(body)
                        patients_successfully_created_or_existing += response_data.get("successCount", 0)
                        if response_data.get("failureCount", 0) > 0:
                            print(f"  Final batch had {response_data.get('failureCount',0)} failures. Details: {response_data.get('errors', [])}")
                            detailed_failures.extend(response_data.get('errors', []))
                        # print(f"  Final batch response: {response_data.get('message', '')}")
                    except json.JSONDecodeError:
                        print(f"  ERROR decoding final batch response: {body}")
                        overall_failed_patient_batches += 1
                elif status is not None:
                    print(f"  ERROR in final patient batch. Status: {status}, Response: {body}")
                    overall_failed_patient_batches += 1

    except FileNotFoundError:
        print(f"FATAL Error: CSV file not found at {CSV_FILE_PATH}.")
        return
    except Exception as e:
        print(f"An unexpected error occurred during patient import: {e}")
    finally:
        if conn: conn.close()

    print(f"\n--- Patient Demographic Import Summary ---")
    print(f"Total unique PRegs processed for demographics: {patients_processed_count}")
    print(f"Successfully created or already existing in DB: {patients_successfully_created_or_existing}")
    print(f"Total batches resulting in errors: {overall_failed_patient_batches}")
    print(f"Total individual patient records reported as failed by server: {len(detailed_failures)}")
    if detailed_failures:
        print("Details of PRegs that failed server-side processing (first 10 shown):")
        for failure in detailed_failures[:10]:
            print(f"  - PReg: {failure.get('pReg', failure.get('data', {}).get('pReg', 'N/A'))}, Reason: {failure.get('error', 'Unknown')}")
    
    # After all patient demographics are processed, update the counter
    if max_preg_val_from_csv > 0:
        update_pReg_counter_in_firestore(max_preg_val_from_csv)
    else:
        print("\nNo valid PReg numbers found in CSV to update the counter.")

def import_historical_visits():
    print("\n--- Starting Historical Visit Import ---BATCH MODE---")
    print(f"Targeting Add Historical Visit Cloud Function (batch) at: https://{LIVE_FUNCTIONS_HOST}{ADD_HISTORICAL_VISIT_FUNCTION_PATH}")
    print(f"Using BATCH_SIZE: {BATCH_SIZE}")

    visits_to_process_map = defaultdict(lambda: {"details": None, "medications": []})
    all_csv_rows = []
    try:
        with open(CSV_FILE_PATH, mode='r', encoding='utf-8-sig') as csvfile:
            reader = csv.DictReader(csvfile)
            if not reader.fieldnames: return
            all_csv_rows = list(reader)
    except FileNotFoundError:
        print(f"FATAL Error: CSV file not found at {CSV_FILE_PATH} for visit import.")
        return
    except Exception as e: return print(f"Error reading CSV for visits: {e}")

    if not all_csv_rows: return print("No data rows found in CSV for visit import.")

    for row in all_csv_rows:
        preg = row.get('PReg', '').strip()
        visit_date_str = row.get('Date', '').strip() # This is like "24:35.0"
        if not preg or not visit_date_str: continue
        visit_key = (preg, visit_date_str)
        if visits_to_process_map[visit_key]["details"] is None:
            visits_to_process_map[visit_key]["details"] = {
                "visitDate": visit_date_str, 
                "complaints": row.get('Complain', '').strip(),
                "examination": row.get('Examination', '').strip(),
                "diagnosis": row.get('Diagnose', '').strip(),
                "investigation": row.get('Investigation', '').strip(),
                "advise": row.get('Advise', '').strip(),
                "nextPlan": row.get('NextPlan', '').strip(),
            }
        med_name = row.get('MName', '').strip()
        if med_name: 
            visits_to_process_map[visit_key]["medications"].append({
                "name": med_name,
                "instructions": row.get('DoseInstruc', '').strip(),
                "duration": row.get('DoseforDay', '').strip()
            })

    print(f"Identified {len(visits_to_process_map)} unique historical visits to prepare for batching.")
    
    visit_batch = []
    total_visits_processed_in_batches = 0
    total_visits_successfully_imported = 0
    overall_failed_visit_batches = 0
    detailed_visit_failures = []
    conn = None
    headers = {'Content-type': 'application/json'}

    for (preg, visit_date_str), visit_data_parts in visits_to_process_map.items():
        if visit_data_parts["details"] is None: continue
        full_visit_data_for_payload = {
            "patientId": preg, # This is the PReg
            "visitData": {
                **visit_data_parts["details"],
                "medications": visit_data_parts["medications"]
            }
        }
        visit_batch.append(full_visit_data_for_payload)
        total_visits_processed_in_batches +=1

        if len(visit_batch) >= BATCH_SIZE:
            print(f"Sending batch of {len(visit_batch)} visits (Total visits processed so far: {total_visits_processed_in_batches})...")
            status, body, conn = send_batch_request(conn, LIVE_FUNCTIONS_HOST, ADD_HISTORICAL_VISIT_FUNCTION_PATH, "visits", visit_batch, headers)
            if status == "CONN_REFUSED": return
            if status and (status == 201 or status == 207):
                try:
                    response_data = json.loads(body)
                    total_visits_successfully_imported += response_data.get("successCount", 0)
                    if response_data.get("failureCount", 0) > 0:
                        print(f"  Visit batch had {response_data.get('failureCount',0)} failures. Details: {response_data.get('errors', [])}")
                        detailed_visit_failures.extend(response_data.get('errors', []))
                except json.JSONDecodeError:
                    print(f"  ERROR decoding visit batch response: {body}")
                    overall_failed_visit_batches +=1
            elif status is not None:
                print(f"  ERROR in visit batch. Status: {status}, Response: {body}")
                overall_failed_visit_batches +=1
            visit_batch = [] # Reset batch
            if conn is None and status is not None and status != "CONN_REFUSED": time.sleep(1)

    # Send any remaining visits
    if visit_batch:
        print(f"Sending final batch of {len(visit_batch)} visits...")
        status, body, conn = send_batch_request(conn, LIVE_FUNCTIONS_HOST, ADD_HISTORICAL_VISIT_FUNCTION_PATH, "visits", visit_batch, headers)
        if status == "CONN_REFUSED": return
        if status and (status == 201 or status == 207):
            try:
                response_data = json.loads(body)
                total_visits_successfully_imported += response_data.get("successCount", 0)
                if response_data.get("failureCount", 0) > 0:
                    print(f"  Final visit batch had {response_data.get('failureCount',0)} failures. Details: {response_data.get('errors', [])}")
                    detailed_visit_failures.extend(response_data.get('errors', []))
            except json.JSONDecodeError:
                print(f"  ERROR decoding final visit batch response: {body}")
                overall_failed_visit_batches +=1
        elif status is not None:
            print(f"  ERROR in final visit batch. Status: {status}, Response: {body}")
            overall_failed_visit_batches +=1
    
    if conn: conn.close()

    print(f"\n--- Historical Visit Import Summary ---")
    print(f"Total unique visits prepared for batching: {len(visits_to_process_map)} (sent as {total_visits_processed_in_batches} items in batches)")
    print(f"Successfully imported visits reported by server: {total_visits_successfully_imported}")
    print(f"Total visit batches resulting in errors: {overall_failed_visit_batches}")
    print(f"Total individual visits reported as failed by server: {len(detailed_visit_failures)}")
    if detailed_visit_failures:
        print("Details of visits that failed server-side processing (first 10 shown):")
        for failure in detailed_visit_failures[:10]:
            print(f"  - PReg: {failure.get('patientId', 'N/A')}, VisitDate: {failure.get('visitDate', failure.get('item',{}).get('visitData',{}).get('visitDate','N/A'))}, Reason: {failure.get('error', failure.get('reason', 'Unknown'))}")

if __name__ == "__main__":
    # import_patients()  # Uncomment to run patient demographic import
    # import_historical_visits() # Uncomment to run historical visit import
    
    # --- For one-time counter update ---
    # You can manually set the known max PReg here if you don't want to re-parse the CSV
    # For example, if you know the max imported PReg was PR-5844:
    # update_pReg_counter_in_firestore(5844) 
    
    # Or, to calculate from CSV and then update (if script is run standalone for this purpose):
    # print("Calculating max PReg from CSV to update counter...")
    # temp_max_preg = 0
    # try:
    #     with open(CSV_FILE_PATH, mode='r', encoding='utf-8-sig') as csvfile:
    #         reader = csv.DictReader(csvfile)
    #         if reader.fieldnames:
    #             for row in reader:
    #                 preg_str = row.get('PReg', '').strip()
    #                 match = re.match(r"PR-(\d+)", preg_str, re.IGNORECASE)
    #                 if match:
    #                     preg_num = int(match.group(1))
    #                     if preg_num > temp_max_preg:
    #                         temp_max_preg = preg_num
    #                 elif preg_str.isdigit(): # Check if it's just a number
    #                      preg_num_int = int(preg_str)
    #                      if preg_num_int > temp_max_preg:
    #                         temp_max_preg = preg_num_int
    #     if temp_max_preg > 0:
    #         update_pReg_counter_in_firestore(temp_max_preg)
    #     else:
    #         print("Could not determine max PReg from CSV for standalone counter update.")
    # except FileNotFoundError:
    #     print(f"CSV file not found at {CSV_FILE_PATH} for standalone counter update.")
    # except Exception as e:
    #     print(f"Error during standalone counter update: {e}")
    print("\nScript finished. Uncomment calls in __main__ to perform actions.")