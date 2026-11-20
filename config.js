const config = {
    db: {
        host: "etl",
        user: "supplix_app",
        password: process.env.SUPPLIX_DB_PASSWORD,
        database: "SUPPLIX_A3_SUBMISSION",
        connectTimeout: 60000
    }
};

module.exports = config;