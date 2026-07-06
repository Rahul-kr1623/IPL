const fs = require('fs');
const path = require('path');

const files = [
  'frontend/src/pages/Stats.jsx',
  'frontend/src/pages/Stadiums.jsx',
  'frontend/src/pages/PointsTable.jsx',
  'frontend/src/pages/Players.jsx',
  'frontend/src/pages/PlayerDetail.jsx',
  'frontend/src/pages/Fixtures.jsx'
];

const API_VAR = "const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';";

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // if API_URL is not declared, declare it at the top after imports
  if (!content.includes('API_URL = ')) {
    // find the last index of "import "
    const lastImportIndex = content.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
        // find the end of that line
        const endOfLine = content.indexOf('\n', lastImportIndex);
        if (endOfLine !== -1) {
            content = content.slice(0, endOfLine + 1) + '\n' + API_VAR + '\n' + content.slice(endOfLine + 1);
            fs.writeFileSync(filePath, content);
            console.log('Fixed ' + file);
        }
    }
  }
});
