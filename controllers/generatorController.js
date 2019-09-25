const Preference = require("../models/preference.js");
const Generator = require("../models/generator.js");
const yelpService = require("../services/yelpService.js");
const bluebird = require("bluebird");
const redis = require("redis"); 
bluebird.promisifyAll(redis);
const cache = redis.createClient(); //!!! TODO: decouple redis from this file

async function createGenerator(req, res, next){
    try {
		const generator = await Generator.create({ 
            limit: req.body.limit, 
            offset: req.body.offset,
            userId: req.params.userId
        });
		return res.status(201).send(generator);
	}
	catch(err) {
		console.log("Error in POST ../generator");
		next(err);
	}
};

async function getGenerator(req, res, next){
	try {
		const generators = await Generator.find({ userId: req.params.userId });
		return res.status(200).send(generators);
	}
	catch(err) {
		console.log("Error in GET ../generator");
		next(err);
	}
};

// async function getGeneratorById(req, res, next){
//     try {
// 		let generator = await Generator.findById(req.params.generatorId);   //need to search based on userid
// 		return res.status(200).send(generator);
// 	}
// 	catch(err){
// 		console.log("Error in GET ../generator/:generatorId");
// 		next(err);
// 	}
// };

//need update method

async function updateGenerator(req, res, next){
    try {
        await Generator.findOneAndUpdate({ userId: req.params.userId }, { 
            ...req.params.limit && { limit: req.params.limit},
            ...req.params.offset && { offset: req.params.offset}
        });
        return res.status(200).send();
    }
    catch(err){
        console.log("Error in UPDATE ../generator");
        next(err);
    }
};

async function next(req, res, next){
    try {
        const { rating, distance, price, location } = await Preference.findOne({ userId: req.params.userId });
        const { limit } = await Generator.findOne({ userId: req.params.userId }) || { limit: 1 };

        const pageKey = `user:${req.params.userId}:page`;
        const cachedPage = await cache.getAsync(pageKey) || 0;
        const offset = cachedPage * limit; 

        //form query
        const query = {
            ...(rating && { rating: rating }),
            ...(distance && { distance: distance }),
            ...(price && { price: price }),
            ...(location && { location: location }),
            ...(limit && { limit: limit }),
            offset: offset
        };
        
        const searchKey = `user:${req.params.userId}:query:${JSON.stringify(query)}`;
        const cachedSearchResult = JSON.parse(await cache.getAsync(searchKey));

        let result;
        //hit
        if(cachedSearchResult)
            result = cachedSearchResult;
        //miss
        else
        {
            const yelp = new yelpService();
            yelp.initialize();
            result = await yelp.businessSearch(query); // TODO: filter result
            //cache result and increment page #
            if(result)
            {
                await cache.setAsync(searchKey, JSON.stringify(result)); // TODO: add expiration
                await cache.incrAsync(pageKey); // TODO: add expiration
            }
        }
        res.status(200).send(result);
    }
    catch(err) {
        console.log("Error in generatorController's next()");
        next(err);
    }
};

module.exports = { 
    next: next,
    getGenerator: getGenerator,
    createGenerator: createGenerator 
};