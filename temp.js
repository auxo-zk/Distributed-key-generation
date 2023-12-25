const fs = require('fs');
const path = require('path');

// Replace with your actual directory path
const directoryPath = './caches';

// Function to check if 'pk' is not in the file name
const is_valid_file = (fileName) => !fileName.includes('pk');

// Read all files from the directory and filter based on the condition
fs.readdir(directoryPath, (err, files) => {
  if (err) {
    console.error('Error reading the directory:', err);
    return;
  }

  const validFiles = files.filter(
    (file) =>
      is_valid_file(file) &&
      fs.statSync(path.join(directoryPath, file)).isFile()
  );

  // Generating the output
  let output = 'const cacheContractFile = [\n';
  output += validFiles
    .map((fileName) => `    { name: '${fileName}', type: 'string' }`)
    .join(',\n');
  output += '\n];';

  // Print the generated code
  console.log(output);
});
