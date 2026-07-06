const fs = require('fs');
const path = require('path');

const files = [
  'frontend/src/pages/Teams.jsx',
  'frontend/src/pages/Stats.jsx',
  'frontend/src/pages/Stadiums.jsx',
  'frontend/src/pages/PointsTable.jsx',
  'frontend/src/pages/Players.jsx',
  'frontend/src/pages/PlayerDetail.jsx',
  'frontend/src/pages/Fixtures.jsx'
];

const API_VAR = "const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';";
let count = 0;

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // if API_URL is not declared, declare it at the top after imports
  if (!content.includes('API_URL = ')) {
    content = content.replace(/(import .*;\n)+/g, match => {
      return match + '\n' + API_VAR + '\n';
    });
  }

  // replace fetch('http://localhost:5000/...') with fetch(`${API_URL}/...`)
  let newContent = content.replace(/'http:\/\/localhost:5000([^']+)'/g, '`${API_URL}$1`');
  newContent = newContent.replace(/"http:\/\/localhost:5000([^"]+)"/g, '`${API_URL}$1`');
  newContent = newContent.replace(/`http:\/\/localhost:5000([^`]+)`/g, '`${API_URL}$1`');

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    count++;
  }
});

console.log('Replaced localhost with API_URL in ' + count + ' files');
