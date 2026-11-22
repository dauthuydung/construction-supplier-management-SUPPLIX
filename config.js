const config = {
    db: {
        host: process.env.SUPPLIX_DB_HOST || "etl",
        user: process.env.SUPPLIX_DB_USER || "supplix_app",
        password: process.env.SUPPLIX_DB_PASSWORD,
        database: process.env.SUPPLIX_DB_NAME || "SUPPLIX_A3_SUBMISSION",
        connectTimeout: 60000
    }
};

module.exports = config;