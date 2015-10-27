module.exports = {
    CHALLENGE_URL: 'https://api.topcoder.com/v2/challenges/active',
    CHALLENGE_FILTER: {
        pageIndex: 1,
        pageSize: 10,
        review: 'COMMUNITY,INTERNAL',
        sortColumn: 'submissionEndDate',
        sortOrder: 'desc',
        technologies: 'iOS,SWIFT,tvOS'
    },
    RESULT_URL: 'https://api.topcoder.com/v2/develop/challenges/result/',
    MONGODB_URL: process.env.MONGOLAB_URL || 'mongodb://localhost:27017/swiftleaderboard',
    CHALLENGES_COLLECTION: 'challenges',
    LEADERBOARD_COLLECTION: 'rankings',
    KEYWORD: 'swiftoberfest',
    NO_RESULTS_MESSAGE: 'You cannot view the results because the challenge is not yet finished or was cancelled.',
    OLD_CHALLENGES: [
        {
            challengeId: 30051611,
            status: 'active',
            registrationStartDate: '2015-10-05T09:23+0000',
            challengeName: 'Convert existing HTML5 prototype to Swift iOS + Integrate Salesforce Mobile SDK oAuth [Swiftoberfest]'
        },
        {
            challengeId: 30051785,
            status: 'active',
            registrationStartDate: '2015-10-16T09:00+0000',
            challengeName: 'Design Arch - REST API Authentication Setup on Heroku for iOS [Swiftoberfest]'
        },
        {
            challengeId: 30051788,
            status: 'active',
            registrationStartDate: '2015-10-17T00:01+0000',
            challengeName: 'Mood-ring Build mood-ring Swift app user and manager functionality [Swiftoberfest]'
        },
    ],
    MONTHS: ['october', 'november', 'december'],
    START_DATE: {
        october: new Date('2015-10-01'),
        november: new Date('2015-11-01'),
        december: new Date('2015-12-01')
    },
    END_DATE: {
        october: new Date('2015-11-01'),
        november: new Date('2015-12-01'),
        december: new Date('2016-01-01')
    },
    PASSING_SCORE: 75,
    PORT: process.env.PORT || 3000,
    INTERVAL: process.env.INTERVAL || 20000
};
