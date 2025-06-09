import csv
import json
import os

# Define the input CSV file path and output JSON file path
CSV_FILE_PATH = '/Users/areebbajwa/Downloads/ClinicData.xlsx - Sheet1.csv'
# New output file for the three distinct lists
JSON_OUTPUT_PATH = os.path.join('functions', 'medication_context_data.json') 

# Column names in your CSV
MEDICATION_COLUMN_NAME = 'MName'
INSTRUCTIONS_COLUMN_NAME = 'DoseInstruc'
DURATION_COLUMN_NAME = 'DoseforDay'

def generate_medication_context_json():
    unique_med_names = set()
    unique_instructions = set()
    unique_durations = set()

    try:
        with open(CSV_FILE_PATH, mode='r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            
            required_columns = [MEDICATION_COLUMN_NAME, INSTRUCTIONS_COLUMN_NAME, DURATION_COLUMN_NAME]
            for col in required_columns:
                if col not in reader.fieldnames:
                    print(f"Error: Column '{col}' not found in CSV header.")
                    print(f"Available columns are: {reader.fieldnames}")
                    return

            for row in reader:
                med_name = row[MEDICATION_COLUMN_NAME]
                if med_name and med_name.strip():
                    unique_med_names.add(med_name.strip())
                
                instructions = row[INSTRUCTIONS_COLUMN_NAME]
                if instructions and instructions.strip():
                    unique_instructions.add(instructions.strip())
                
                duration = row[DURATION_COLUMN_NAME]
                if duration and duration.strip():
                    unique_durations.add(duration.strip())
        
        if not unique_med_names and not unique_instructions and not unique_durations:
            print("No relevant data (medication names, instructions, or durations) found or extracted from the CSV.")
            return

        print(f"Found {len(unique_med_names)} unique medication names.")
        print(f"Found {len(unique_instructions)} unique instructions.")
        print(f"Found {len(unique_durations)} unique durations.")

        context_data = {
            "medicationNames": sorted(list(unique_med_names)),
            "instructions": sorted(list(unique_instructions)),
            "durations": sorted(list(unique_durations))
        }

        os.makedirs(os.path.dirname(JSON_OUTPUT_PATH), exist_ok=True)

        with open(JSON_OUTPUT_PATH, mode='w', encoding='utf-8') as jsonfile:
            json.dump(context_data, jsonfile, indent=4, ensure_ascii=False)
        
        print(f"Successfully generated {JSON_OUTPUT_PATH} with extracted context data.")

    except FileNotFoundError:
        print(f"Error: CSV file not found at {CSV_FILE_PATH}")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    generate_medication_context_json() 