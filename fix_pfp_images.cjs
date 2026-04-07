const fs = require('fs');

const fileNames = ['subject_1.json', 'subject_2.json', 'subject_3.json', 'subject_4.json', 'subject_5.json', 'subject_6.json', 'subject_7.json', 'subject_8.json', 'subject_9.json'];

fileNames.forEach(file => {
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let modified = false;
    data.forEach(q => {
      // Find "PFP-..." in the question string or answers
      if (q.question && q.image === null) {
        // Regex to capture things like PFP-062 or PFP-062a
        const match = q.question.match(/(PFP-\d+[a-z]?)/i);
        if (match) {
          const imageName = match[1].toUpperCase() + '.jpg';
          q.image = imageName;
          modified = true;
          console.log(`Updated ${file} ID ${q.id} with image ${imageName}`);
        }
      }
    });

    if (modified) {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      console.log(`Saved modifications to ${file}`);
    }
  }
});
