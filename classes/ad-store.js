var fs = require("fs");
var _ = require('lodash');

const storageFileName = 'ad-storage.json'

class AdStore {
    constructor() {
        this.ads = []
        this.failedToSave = false
        this.load()
    }

    load() {
        try {
            this.ads = JSON.parse(fs.readFileSync(storageFileName)) || []
            console.log(`Datastore loaded ${this.ads.length} ads\n`)
        } catch (e) {
            console.log('No datastore found. Will create a new one.')
            this.data = []
        }
    }

    save() {
        try {
            fs.writeFile(storageFileName, JSON.stringify(this.ads, null, '\t'), "utf8");
        } catch (e) {
            if (!this.failedToSave) {
                console.error("unable to save processed ads")
            }
            this.failedToSave = true;
        }
    }

    add(ads) {
        let newAds = ads.filter(ad => !ad.isInList(this.ads));

        newAds = _.uniqBy(newAds, 'url');
        newAds = _.orderBy(newAds, ['datePosted'], ['desc']);

        if (!newAds.length) {
            return [];
        }

        // try push with spread
        this.ads.push(...newAds); // = this.ads.concat(newAds);
        this.save();

        return newAds;
    }

    get length() {
        return this.ads.length
    }
}

exports.AdStore = AdStore