import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runAIModelAnalysis(domContent) {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, 'inference.py');
    const adapterPath = path.join(__dirname, '../models/ai_accessibility_model');

    // Spawn the Python process
    const pythonProcess = spawn('python', [
      pythonScriptPath,
      '--adapter_path', adapterPath
    ]);
    
    // Pass the large DOM string safely via stdin
    pythonProcess.stdin.write(domContent);
    pythonProcess.stdin.end();

    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}. Error: ${errorData}`);
        return reject(new Error('The AI Intelligence Engine encountered an error during inference.'));
      }

      try {
        const result = JSON.parse(outputData);
        resolve(result);
      } catch (err) {
        console.error('Failed to parse AI output:', outputData);
        reject(new Error('Invalid output format from AI Inference Engine.'));
      }
    });
  });
}
