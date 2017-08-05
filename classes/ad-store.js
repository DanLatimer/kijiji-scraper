var fs = require("fs");

const storageFileName = 'processedAds.json'
let processedAds = loadProcessedAds() || [];

function loadProcessedAds() {
    try {
        return JSON.parse(fs.readFileSync(storageFileName))
            // return require(`../${storageFileName}`)
    } catch (e) {
        console.log('No datastore found. Creating a new one.')
        return [];
    }
}

var failedToSave = false;

function saveProcessedAds(processedAds) {
    try {
        console.log(`writing ${processedAds.length} ads to file`)
        fs.writeFile(storageFileName, JSON.stringify(processedAds, null, '\t'), "utf8");
        console.log(`write completed without throwing`)
    } catch (e) {
        if (!failedToSave) {
            console.error("unable to save processed ads")
        }
        failedToSave = true;
    }
}

exports.AdStore = {
    loadProcessedAds: loadProcessedAds,
    saveProcessedAds: saveProcessedAds,
    get processedAds() {
        return processedAds
    },
    set processedAds(ads) {
        processedAds = ads
    }
}