const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('wro3'));

app.post('/save-mosaico', (req, res) => {
    const data = req.body;
    const filePath = path.join(__dirname, 'wro3', 'mosaico.json');
    
    fs.writeFile(filePath, JSON.stringify(data, null, 4), (err) => {
        if (err) {
            console.error('Error writing file:', err);
            return res.status(500).send('Error saving data');
        }
        console.log('mosaico.json updated!');
        res.send('Saved successfully');
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Open http://localhost:${port}/index.html to start detecting`);
});
