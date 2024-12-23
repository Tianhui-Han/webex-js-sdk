import {assert, expect} from '@webex/test-helper-chai';
import LoggerProxy from '@webex/plugin-meetings/src/common/logs/logger-proxy';
import Webinar from '@webex/plugin-meetings/src/webinar';
import MockWebex from '@webex/test-helper-mock-webex';
import { v4 as uuidv4 } from 'uuid';
import sinon from 'sinon';

describe('plugin-meetings', () => {
    describe('Webinar', () => {

        let webex;
        let webinar;
        let uuidStub;
        let getUserTokenStub; 

        beforeEach(() => {
            // @ts-ignore
            getUserTokenStub = sinon.stub().resolves('test-token'); 
            uuidStub = sinon.stub(uuidv4, 'v4').returns('test-uuid');            
            webex = new MockWebex({});
            webex.internal.mercury.on = sinon.stub();
            webinar = new Webinar({}, {parent: webex});
            webinar.locusUrl = 'locusUrl';
            webinar.webcastInstanceUrl = 'webcastInstanceUrl';
            webex.request = sinon.stub().returns(Promise.resolve('REQUEST_RETURN_VALUE'));
            webex.meetings = {};
            webex.credentials.getUserToken = getUserTokenStub;
            webex.meetings.getMeetingByType = sinon.stub();
        });

        afterEach(() => {
          sinon.restore(); 
        });

        describe('#locusUrlUpdate', () => {
            it('sets the locus url', () => {
                webinar.locusUrlUpdate('newUrl');

                assert.equal(webinar.locusUrl, 'newUrl');
            });
        });

        describe('#updateWebcastUrl', () => {
            it('sets the webcast instance url', () => {
                webinar.updateWebcastUrl({resources: {webcastInstance: {url:'newUrl'}}});

                assert.equal(webinar.webcastInstanceUrl, 'newUrl');
            });
        });


        describe('#updateCanManageWebcast', () => {
          it('sets the webcast instance url when valid', () => {
            webinar.updateWebcastUrl({resources: {webcastInstance: {url:'newUrl'}}});
            assert.equal(webinar.webcastInstanceUrl, 'newUrl', 'webcast instance URL should be updated');
          });

          it('handles missing resources gracefully', () => {
              webinar.updateWebcastUrl({});
              assert.isUndefined(webinar.webcastInstanceUrl, 'webcast instance URL should be undefined');
          });

          it('handles missing webcastInstance gracefully', () => {
              webinar.updateWebcastUrl({resources: {}});
              assert.isUndefined(webinar.webcastInstanceUrl, 'webcast instance URL should be undefined');
          });

          it('handles missing URL gracefully', () => {
              webinar.updateWebcastUrl({resources: {webcastInstance: {}}});
              assert.isUndefined(webinar.webcastInstanceUrl, 'webcast instance URL should be undefined');
          });
        });

      describe('#updateRoleChanged', () => {
        it('updates roles when promoted from attendee to panelist', () => {
          const payload = {
            oldRoles: ['ATTENDEE'],
            newRoles: ['PANELIST']
          };

          const result = webinar.updateRoleChanged(payload);

          assert.equal(webinar.selfIsPanelist, true, 'self should be a panelist');
          assert.equal(webinar.selfIsAttendee, false, 'self should not be an attendee');
          assert.equal(webinar.canManageWebcast, false, 'self should not have manage webcast capability');
          assert.equal(result.isPromoted, true, 'should indicate promotion');
          assert.equal(result.isDemoted, false, 'should not indicate demotion');
        });

        it('updates roles when demoted from panelist to attendee', () => {
          const payload = {
            oldRoles: ['PANELIST'],
            newRoles: ['ATTENDEE']
          };

          const result = webinar.updateRoleChanged(payload);

          assert.equal(webinar.selfIsPanelist, false, 'self should not be a panelist');
          assert.equal(webinar.selfIsAttendee, true, 'self should be an attendee');
          assert.equal(webinar.canManageWebcast, false, 'self should not have manage webcast capability');
          assert.equal(result.isPromoted, false, 'should not indicate promotion');
          assert.equal(result.isDemoted, true, 'should indicate demotion');
        });

        it('updates roles when promoted to moderator', () => {
          const payload = {
            oldRoles: ['PANELIST'],
            newRoles: ['MODERATOR']
          };

          const result = webinar.updateRoleChanged(payload);

          assert.equal(webinar.selfIsPanelist, false, 'self should not be a panelist');
          assert.equal(webinar.selfIsAttendee, false, 'self should not be an attendee');
          assert.equal(webinar.canManageWebcast, true, 'self should have manage webcast capability');
          assert.equal(result.isPromoted, false, 'should not indicate promotion');
          assert.equal(result.isDemoted, false, 'should not indicate demotion');
        });

        it('updates roles when unchanged (remains as panelist)', () => {
          const payload = {
            oldRoles: ['PANELIST'],
            newRoles: ['PANELIST']
          };

          const result = webinar.updateRoleChanged(payload);

          assert.equal(webinar.selfIsPanelist, true, 'self should remain a panelist');
          assert.equal(webinar.selfIsAttendee, false, 'self should not be an attendee');
          assert.equal(webinar.canManageWebcast, false, 'self should not have manage webcast capability');
          assert.equal(result.isPromoted, false, 'should not indicate promotion');
          assert.equal(result.isDemoted, false, 'should not indicate demotion');
        });
      });

      describe("#setPracticeSessionState", () => {
        [true, false].forEach((enabled) => {
          it(`sends a PATCH request to ${enabled ? "enable" : "disable"} the practice session`, async () => {
            const result = await webinar.setPracticeSessionState(enabled);
            assert.calledOnce(webex.request);
            assert.calledWith(webex.request, {
              method: "PATCH",
              uri: `${webinar.locusUrl}/controls`,
              body: {
                practiceSession: { enabled }
              }
            });
            assert.equal(result, "REQUEST_RETURN_VALUE", "should return the resolved value from the request");
          });
        });

        it('handles API call failures gracefully', async () => {
          webex.request.rejects(new Error('API_ERROR'));
          const errorLogger = sinon.stub(LoggerProxy.logger, 'error');

          try {
            await webinar.setPracticeSessionState(true);
            assert.fail('setPracticeSessionState should throw an error');
          } catch (error) {
            assert.equal(error.message, 'API_ERROR', 'should throw the correct error');
            assert.calledOnce(errorLogger);
            assert.calledWith(errorLogger, 'Meeting:webinar#setPracticeSessionState failed', sinon.match.instanceOf(Error));
          }

          errorLogger.restore();
        });
      });

      describe('#updatePracticeSessionStatus', () => {
        it('sets PS state true', () => {
          webinar.updatePracticeSessionStatus({enabled: true});

          assert.equal(webinar.practiceSessionEnabled, true);
        });
        it('sets PS state true', () => {
          webinar.updatePracticeSessionStatus({enabled: false});

          assert.equal(webinar.practiceSessionEnabled, false);
        });
      });

      describe("#startWebcast", () => {
        const meeting = {
          locusId: 'locusId',
          correlationId: 'correlationId',
        }
        const layout = {
          videoLayout: 'Prominent',
          contentLayout: 'Prominent',
          syncStageLayout: false,
          syncStageInMeeting: false,
        }
        it(`sends a PUT request to start the webcast`, async () => {
          const result = await webinar.startWebcast(meeting, layout);
          assert.calledOnce(webex.request);
          assert.calledWith(webex.request, {
            method: "PUT",
            uri: `${webinar.webcastInstanceUrl}/streaming`,
            headers: {
              authorization: 'test-token',
              trackingId: 'webex-js-sdk_test-uuid',
              'Content-Type': 'application/json'
            },
            body: {
              action: 'start',
              meetingInfo: {
                locusId: meeting.locusId,
                correlationId: meeting.correlationId,
              },
              layout,
            }
          });
          assert.equal(result, "REQUEST_RETURN_VALUE", "should return the resolved value from the request");
        });

        it('handles API call failures gracefully', async () => {
          webex.request.rejects(new Error('API_ERROR'));
          const errorLogger = sinon.stub(LoggerProxy.logger, 'error');

          try {
            await webinar.startWebcast(meeting, layout);
            assert.fail('startWebcast should throw an error');
          } catch (error) {
            assert.equal(error.message, 'API_ERROR', 'should throw the correct error');
            assert.calledOnce(errorLogger);
            assert.calledWith(errorLogger, 'Meeting:webinar#startWebcast failed', sinon.match.instanceOf(Error));
          }

          errorLogger.restore();
        });
      });

      describe("#stopWebcast", () => {
        it(`sends a PUT request to stop the webcast`, async () => {
          const result = await webinar.stopWebcast();
          assert.calledOnce(webex.request);
          assert.calledWith(webex.request, {
            method: "PUT",
            uri: `${webinar.webcastInstanceUrl}/streaming`,
            headers: {
              authorization: 'test-token',
              trackingId: 'webex-js-sdk_test-uuid',
              'Content-Type': 'application/json'
            },
            body: {
              action: 'stop',
            }
          });
          assert.equal(result, "REQUEST_RETURN_VALUE", "should return the resolved value from the request");
        });
  
        it('handles API call failures gracefully', async () => {
          webex.request.rejects(new Error('API_ERROR'));
          const errorLogger = sinon.stub(LoggerProxy.logger, 'error');
  
          try {
            await webinar.stopWebcast();
            assert.fail('stopWebcast should throw an error');
          } catch (error) {
            assert.equal(error.message, 'API_ERROR', 'should throw the correct error');
            assert.calledOnce(errorLogger);
            assert.calledWith(errorLogger, 'Meeting:webinar#stopWebcast failed', sinon.match.instanceOf(Error));
          }
  
          errorLogger.restore();
        });
      });


      describe("#queryWebcastLayout", () => {
        it(`sends a GET request to query the webcast layout`, async () => {
          const result = await webinar.queryWebcastLayout();
          assert.calledOnce(webex.request);
          assert.calledWith(webex.request, {
            method: "GET",
            uri: `${webinar.webcastInstanceUrl}/layout`,
            headers: {
              authorization: 'test-token',
              trackingId: 'webex-js-sdk_test-uuid',
            },
          });
          assert.equal(result, "REQUEST_RETURN_VALUE", "should return the resolved value from the request");
        });
  
        it('handles API call failures gracefully', async () => {
          webex.request.rejects(new Error('API_ERROR'));
          const errorLogger = sinon.stub(LoggerProxy.logger, 'error');
  
          try {
            await webinar.queryWebcastLayout();
            assert.fail('queryWebcastLayout should throw an error');
          } catch (error) {
            assert.equal(error.message, 'API_ERROR', 'should throw the correct error');
            assert.calledOnce(errorLogger);
            assert.calledWith(errorLogger, 'Meeting:webinar#queryWebcastLayout failed', sinon.match.instanceOf(Error));
          }
  
          errorLogger.restore();
        });
      });

      describe("#updateWebcastLayout", () => {
        const layout = {
          videoLayout: 'Prominent',
          contentLayout: 'Prominent',
          syncStageLayout: false,
          syncStageInMeeting: false,
        }
        it(`sends a PUT request to update the webcast layout`, async () => {
          const result = await webinar.updateWebcastLayout(layout);
          assert.calledOnce(webex.request);
          assert.calledWith(webex.request, {
            method: "PUT",
            uri: `${webinar.webcastInstanceUrl}/layout`,
            headers: {
              authorization: 'test-token',
              trackingId: 'webex-js-sdk_test-uuid',
              'Content-Type': 'application/json'
            },
            body: {
              layout
            }
          });
          assert.equal(result, "REQUEST_RETURN_VALUE", "should return the resolved value from the request");
        });
  
        it('handles API call failures gracefully', async () => {
          webex.request.rejects(new Error('API_ERROR'));
          const errorLogger = sinon.stub(LoggerProxy.logger, 'error');
  
          try {
            await webinar.updateWebcastLayout(layout);
            assert.fail('updateWebcastLayout should throw an error');
          } catch (error) {
            assert.equal(error.message, 'API_ERROR', 'should throw the correct error');
            assert.calledOnce(errorLogger);
            assert.calledWith(errorLogger, 'Meeting:webinar#updateWebcastLayout failed', sinon.match.instanceOf(Error));
          }
  
          errorLogger.restore();
        });
      });
      
      describe("#searchWebcastAttendee", () => {
        const queryString = 'queryString'
        it(`sends a GET request to search the webcast attendee`, async () => {
          const result = await webinar.searchWebcastAttendee(queryString);
          assert.calledOnce(webex.request);
          assert.calledWith(webex.request, {
            method: "GET",
            uri: `${webinar.webcastInstanceUrl}/attendees?keyword=${queryString}`,
            headers: {
              authorization: 'test-token',
              trackingId: 'webex-js-sdk_test-uuid',
            },
          });
          assert.equal(result, "REQUEST_RETURN_VALUE", "should return the resolved value from the request");
        });

        it(`if queryString not exist, use empty string`, async () => {
          const result = await webinar.searchWebcastAttendee(undefined);
          assert.calledOnce(webex.request);
          assert.calledWith(webex.request, {
            method: "GET",
            uri: `${webinar.webcastInstanceUrl}/attendees?keyword=`,
            headers: {
              authorization: 'test-token',
              trackingId: 'webex-js-sdk_test-uuid',
            },
          });
          assert.equal(result, "REQUEST_RETURN_VALUE", "should return the resolved value from the request");
        });
  
        it('handles API call failures gracefully', async () => {
          webex.request.rejects(new Error('API_ERROR'));
          const errorLogger = sinon.stub(LoggerProxy.logger, 'error');
  
          try {
            await webinar.searchWebcastAttendee(queryString);
            assert.fail('searchWebcastAttendee should throw an error');
          } catch (error) {
            assert.equal(error.message, 'API_ERROR', 'should throw the correct error');
            assert.calledOnce(errorLogger);
            assert.calledWith(errorLogger, 'Meeting:webinar#searchWebcastAttendee failed', sinon.match.instanceOf(Error));
          }
  
          errorLogger.restore();
        });
      });
            
      describe("#expelWebcastAttendee", () => {
        const participantId = 'participantId'
        it(`sends a DELETE request to expel the webcast attendee`, async () => {
          const result = await webinar.expelWebcastAttendee(participantId);
          assert.calledOnce(webex.request);
          assert.calledWith(webex.request, {
            method: "DELETE",
            uri: `${webinar.webcastInstanceUrl}/attendees/${participantId}`,
            headers: {
              authorization: 'test-token',
              trackingId: 'webex-js-sdk_test-uuid',
            },
          });
          assert.equal(result, "REQUEST_RETURN_VALUE", "should return the resolved value from the request");
        });
  
        it('handles API call failures gracefully', async () => {
          webex.request.rejects(new Error('API_ERROR'));
          const errorLogger = sinon.stub(LoggerProxy.logger, 'error');
  
          try {
            await webinar.expelWebcastAttendee(participantId);
            assert.fail('expelWebcastAttendee should throw an error');
          } catch (error) {
            assert.equal(error.message, 'API_ERROR', 'should throw the correct error');
            assert.calledOnce(errorLogger);
            assert.calledWith(errorLogger, 'Meeting:webinar#expelWebcastAttendee failed', sinon.match.instanceOf(Error));
          }
  
          errorLogger.restore();
        });
      });
    })
})
