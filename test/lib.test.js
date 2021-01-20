const config = require('../config/config').settings
const assert = require('assert')
const sinon = require('sinon');
const expect = require('chai').expect
const lib = require('../lib');
const queue = require('../lib').queue;
// TODO update package test script and add cross_env dev dependency
ids = [
    'cabe27e5c8b8cb7cdc4e152f1cf013a89adc7a71',
    '1c33a6e2ac7d7fc098105b21a702e104e09767cf',
    'hf4ac7d7fc0983748702e10738hw4382f347fu38',  // Fake
    '7bdf62'  // errored
];


/**
 * A test for the function ensureArray.  Should return an array but not affect array inputs.
 */
describe('Test ensureArray:', function() {
    it('Check returns array', function () {
        let s = 'foo'
        assert(Array.isArray(lib.ensureArray(s)), 'failed to return array')
        assert.deepStrictEqual(lib.ensureArray(s), [s], 'failed to return array')
        let arr = ['bar']
        assert.strictEqual(lib.ensureArray(arr), arr, 'failed to return array')
    });
});


/**
 * This tests the shields callback which returns sheilds.io API data for coverage and build status.
 */
describe("strToBool function", () => {
   it('Check valid true', () => {
       strings = ['on', 'true', 'True', '1', 'ON'];
       strings.forEach((x) => { expect(lib.strToBool(x)).true; });
   });

   it('Check valid false', () => {
       strings = ['', null, undefined, '0', 'false'];
       strings.forEach((x) => { expect(lib.strToBool(x)).false; });
   });
});


/**
 * A test for the function partial.  Should curry function input.
 */
describe('Test partial:', function() {
    it('expect curried function', function () {
        let f = (a, b) => { return a + b; };
        let f0 = lib.partial(f);
        expect(f0(2)).instanceOf(Function)
        expect(f0(2, 2)).eq(4)
    });
});


/**
 * A test for the function updateJobFromRecord.
 * @todo add test for compareCoverage call
 */
describe('Test updateJobFromRecord:', function() {
    var job;

    beforeEach(function() {
        queue.process(async (_job, _done) => {});  // nop
        queue.pile = [];
        job = {
            data: {
                sha: null
            }
        };
   })

    it('expect no record found', function () {
        job.data.sha = ids[2];
        const updated = lib.updateJobFromRecord(job);
        expect(updated).false;
    });

    it('expect updated', function () {
        job.data.sha = ids[0];
        const updated = lib.updateJobFromRecord(job);
        expect(updated).true;
        expect(job.data).deep.keys(['sha', 'status', 'description', 'coverage']);
    });
});


/**
 * A test for the function startJobTimer.  Should kill the process when time is up and update the
 * job data.
 */
describe('Test startJobTimer:', function() {
   var clock;
   var killed;
   var childProcess;
   var err;

    before(function () {
        killed = false;
        childProcess = {
            kill: () => { killed = true; }
        };
        clock = sinon.useFakeTimers();
        err = null;
    });

    it('expect process killed', function () {
        const job = { data: {} };
        lib.startJobTimer(job, childProcess, (e) => { err = e; });
        expect(err).null;
        // Skip to the end...
        clock.tick(config.timeout + 1);
        expect(err).instanceOf(Error);
        expect(killed).true;
    });
});


/**
 * A test for the function loadTestRecords.
 */
describe('Test loading test records:', function() {
    // Check NODE_ENV is correctly set, meaning our imported settings will be test ones
    before(function () {
        assert(process.env.NODE_ENV.startsWith('test'), 'Test run outside test env')
    });

    it('Check loading existing record', function () {
        let id = ids[0];
        const record = lib.loadTestRecords(id);
        assert(record != null, 'failed to load record')
        assert(!Array.isArray(record), 'failed to return single obj')
        assert.strictEqual(record.commit, id, 'failed to return correct record')
    });

    it('Check loading multiple records', function () {
        const records = lib.loadTestRecords(ids);
        assert(records != null, 'failed to load records')
        assert(Array.isArray(records), 'failed to return array')
        assert.strictEqual(records.length, ids.length-1, 'failed to return both records')
    });

    it('Check loading fail', function () {
        let id = ids[2]  // this commit is not in db
        const record = lib.loadTestRecords(id);
        let isEmptyArr = x => { return Array.isArray(x) && x.length === 0; }
        assert(isEmptyArr(record))
        assert(isEmptyArr(lib.loadTestRecords([id, id])))
    });
});


/**
 * This tests the shields callback which returns sheilds.io API data for coverage and build status.
 */
describe("getBadgeData function", () => {
   var scope;  // Our server mock
   var sandbox;  // Sandbox for spying on queue
   var input;  // Input data for function

   beforeEach(function () {
      queue.process(async (_job, _done) => {})  // nop
      sandbox = sinon.createSandbox();
      sandbox.spy(queue);
      input = {
         sha: null,
         owner: process.env['REPO_OWNER'],
         repo: '',
         branch: '',
         context: ''
      };
   });

   it('Check Coverage', function () {
      var data, expected;

      // Low coverage
      input['sha'] = ids[0];
      input['context'] = 'coverage';
      data = lib.getBadgeData(input);
      expected = {
         schemaVersion: 1,
         label: input['context'],
         message: '22.2%',
         color: 'red'
      };
      expect(data).to.deep.equal(expected);
      sandbox.assert.notCalled(queue.add);

      // High coverage
      input['sha'] = ids[1];
      expected['message'] = '75.77%';
      expected['color'] = 'brightgreen';
      data = lib.getBadgeData(input);
      expect(data).to.deep.equal(expected);
      sandbox.assert.notCalled(queue.add);

      // Errored
      input['sha'] = ids[3];
      expected['message'] = 'unknown';
      expected['color'] = 'orange';
      data = lib.getBadgeData(input);
      expect(data).to.deep.equal(expected);
      sandbox.assert.notCalled(queue.add);

      // No coverage
      input['sha'] = ids[2];
      expected['message'] = 'pending';
      expected['color'] = 'orange';
      data = lib.getBadgeData(input);
      expect(data).to.deep.equal(expected);
      sandbox.assert.calledOnce(queue.add);
   });

   it('Check build status', function () {
      var data, expected;

      // Failed tests
      input['sha'] = ids[0];
      input['context'] = 'status';
      data = lib.getBadgeData(input);
      expected = {
         schemaVersion: 1,
         label: 'build',
         message: 'failing',
         color: 'red'
      };
      expect(data).to.deep.equal(expected);
      sandbox.assert.notCalled(queue.add);

      // High coverage
      input['sha'] = ids[1];
      expected['message'] = 'passing';
      expected['color'] = 'brightgreen';
      data = lib.getBadgeData(input);
      expect(data).to.deep.equal(expected);
      sandbox.assert.notCalled(queue.add);

      // Errored
      input['sha'] = ids[3];
      expected['message'] = 'unknown';
      expected['color'] = 'orange';
      data = lib.getBadgeData(input);
      expect(data).to.deep.equal(expected);
      sandbox.assert.notCalled(queue.add);

      // No coverage
      input['sha'] = ids[2];
      expected['message'] = 'pending';
      expected['color'] = 'orange';
      data = lib.getBadgeData(input);
      expect(data).to.deep.equal(expected);
      sandbox.assert.calledOnce(queue.add);
   });

   it('Check force flag', function () {
      input['sha'] = ids[1];
      input['context'] = 'status';
      input['force'] = true;  // set force flag to true
      const expected = {
         schemaVersion: 1,
         label: 'build',
         message: 'pending',
         color: 'orange'
      };
      data = lib.getBadgeData(input);
      expect(data).to.deep.equal(expected);
      sandbox.assert.calledOnce(queue.add);
   });

   it('Check error handling', function () {
      expect(() => lib.getBadgeData(input)).to.throw(ReferenceError, 'sha');
      input['sha'] = ids[0]
      expect(() => lib.getBadgeData(input)).to.throw(ReferenceError, 'Context');
      input['context'] = 'updated'
      expect(() => lib.getBadgeData(input)).to.throw(TypeError, 'context');
   });

   afterEach(function () {
      queue.pile = [];
      sandbox.restore();
   });

});


/**
 * A test for the main queue process callback.
 */
describe('Test short circuit', function() {

    beforeEach(function () {
        queue.process(async (_job, _done) => {});  // nop
        queue.pile = [];
    });

    it('expect force flag set', function (done) {
       // We expect that the job that's on the pile has 'force' set to false
        // Add job to the pile
        queue.add( { sha: ids[0] })  // Record exists
        function tests(run) {
           expect(run).true;
           expect(queue.pile[0].data.force).false;
           done();
        }
        const job = {
           data: {
              sha: ids[0]  // Record exists
           },
           done: () => tests(false)
        };

        lib.shortCircuit(job, () => { tests(true); });
    });

    it('expect short circuit', function (done) {
       // We expect that the job that's on the pile has 'force' set to false
        const job = {
           data: {
              sha: ids[0],  // record exists
              force: false  // load from record
           }
        };
        function tests(run) {
           expect(run).false;
           expect(job.data.status).eq('failure');
           done();
        }
        job.done = () => tests(false);
        lib.shortCircuit(job, () => tests(true));
    });

    it('expect forced test function called', function (done) {
       // Record doesn't exist, so we expect the tests to be run anyway
        function tests(run) {
           expect(run).true;
           done();
        }
        const job = {
           data: {
              sha: ids[2],  // record exists
              force: false  // load from record
           },
           done: () => tests(false)
        };
        lib.shortCircuit(job, () => tests(true));
    });
});


/**
 * A test for shortID function.
 */
describe('Test shortID', function() {

   it('expect short str from int', function () {
      const out = lib.shortID(987654321);
      expect(out).eq('9876543');
   });

   it('expect short str from str', function () {
      const out = lib.shortID('98r7654321o', 3);
      expect(out).eq('98r');
   });

   it('expect works with arrays', function () {
      const out = lib.shortID([987654321, '7438ht43', null], 3);
      expect(out).deep.equal(['987', '743', null]);
   });

});


/**
 * A test for isSHA function.
 */
describe('Test isSHA', function() {

   it('expect true on SHA', function () {
      expect(lib.isSHA(ids[0])).true;
   });

   it('expect false on fake', function () {
      expect(lib.isSHA(ids[2])).false;
   });
});

