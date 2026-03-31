const fs = require('fs');
const axios = require('axios');

async function runTest() {
    console.log('[Test] Generating a 200-line CSV file...');
    let csvData = 'id,name,value\n';
    for (let i = 1; i <= 200; i++) {
        csvData += `${i},Item_${i},${Math.random().toFixed(4)}\n`;
    }
    fs.writeFileSync('test-data.csv', csvData);
    console.log('[Test] test-data.csv generated.');

    console.log('[Test] Submitting to local backend map-reduce engine...');
    try {
        const res = await axios.post('http://localhost:3000/submit-job', {
            description: 'Automated Map-Reduce Test',
            files: ['test-data.csv'],
            resources_required: { cpu: 1, ram: 1, gpu: false },
            submitterClientId: 'test-client',
            submitterHostname: 'test-host'
        }, { timeout: 30000 });

        console.log('[Test] Success! Backend Responded:');
        console.log(JSON.stringify(res.data, null, 2));

        console.log('[Test] Looking for split chunk files on disk...');
        const files = fs.readdirSync('uploads').filter(f => f.startsWith(`chunk_${res.data.jobId}`));
        console.log(`[Test] Found ${files.length} chunks generated in /uploads!`);
        files.forEach(f => console.log(`  - ${f}`));
        
    } catch (err) {
        console.error('[Test] Failure:', err.response?.data || err.message);
    }
}

runTest();
