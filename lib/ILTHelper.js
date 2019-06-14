const LTOHelper = require('./LTOHelper');
const RETRY_RATE = 5000;
const MAX_RETRY = 12;

class ILTHelper extends LTOHelper {

  deleteLicenseChain(account, licenseId) {
    let chain = this.createEventChain(account, licenseId);
    return this.deleteEventChain(account, chain.id);
  }

  deleteMainProcess(account, licenseId) {
    const chain = this.createEventChain(account, licenseId);
    const processId = chain.createProjectionId('main');
    return this.deleteProcess(account, processId);
  }

  deleteTransportProcess(account, licenseId, transportId) {
    const chain = this.createEventChain(account, licenseId);
    const processId = chain.createProjectionId(transportId);
    return this.deleteProcess(account, processId);
  }

  async initializeLicenseProcess(chain, processId, iltAccount, licenseholderAccount, license) {
    // Generate identity ids
    this.generateId(iltAccount, chain, 'ILT');
    this.generateId(licenseholderAccount, chain, 'Waste BV');

    // Add ilt and license holder identities
    chain = await this.addIdentityEvent(chain, iltAccount);
    chain = await this.addIdentityEvent(chain, licenseholderAccount, iltAccount);

    // Load the scenario and add it to the chain
    const scenario = this.loadScenarioFromFile(`${__dirname}/../scenarios/main/scenario.json`);
    chain = this.addScenarioEvent(chain, iltAccount, scenario);

    // Initialize process
    const actors = {
      issuer: iltAccount.id,
      license_holder: licenseholderAccount.id
    };
    chain = this.addProcessInitationEvent(chain, iltAccount, scenario.id, processId, actors);

    // Send the first issue response
    chain = this.addResponseEvent(chain, iltAccount, processId, 'issue', license);

    return chain;
  }

  async initializeTransportProcess(chain, iltAccount, licenseHolderAccount, transportAccount, recipientAccount, processorAccount, transport, processId) {
    // Generate Identity IDs
    this.generateId(transportAccount, chain, transport.transport.name);
    this.generateId(recipientAccount, chain, transport.recipient.name);
    this.generateId(processorAccount, chain, transport.processor.name);

    // Add transport, recipient and processor identities
    chain = await this.addIdentityEvent(chain, transportAccount, licenseHolderAccount);
    chain = await this.addIdentityEvent(chain, recipientAccount, licenseHolderAccount);
    if (recipientAccount.id != processorAccount.id) {
      chain = await this.addIdentityEvent(chain, processorAccount, iltAccount);
    }

    // Load the scenario and add it to the chain
    const scenario = this.loadScenarioFromFile(`${__dirname}/../scenarios/transport/scenario.json`);
    chain = this.addScenarioEvent(chain, iltAccount, scenario);

    // Initialize the transport process
    const actors = {
      issuer: iltAccount.id,
      license_holder: licenseHolderAccount.id,
      transport: transportAccount.id,
      recipient: recipientAccount.id,
      processor: processorAccount.id
    };
    chain = this.addProcessInitationEvent(chain, iltAccount, scenario.id, processId, actors);

    // Send first start response
    chain = this.addResponseEvent(chain, licenseHolderAccount, processId, 'start', transport);

    return chain;
  }

  async startTransport(chain, account, processId) {

    chain = this.addResponseEvent(chain, account, processId, 'transport');
    return chain;
  }

  async receiveTransport(chain, account, processId, transport) {
    chain = this.addResponseEvent(chain, account, processId, 'receive', transport);
    return chain;
  }

  async processTransport(chain, account, processId) {
    chain = this.addResponseEvent(chain, account, processId, 'process');
    return chain;
  }

  async safeLoadProcess(account, processId, activeState, allowStates = [], retryCount = 0) {
    if (retryCount > MAX_RETRY) {
      throw new Error('Maximum nr of retries exceeded');
    }

    let process;
    try {
      process = await this.loadProcess(account, processId);
    } catch (e) {
      console.log(e.message);
    }
    if (process && process.current && process.current.key === activeState) {
      return process;
    } else if (process && process.current && allowStates.indexOf(process.current.key) == -1) {
      throw new Error('Not allowed to perform this action: ' + process.current.key + ' states: [' + allowStates.join(',') + '] activeState: ' + activeState);
    } else {
      return new Promise((resolve) => {
        console.log(`Going to retry loading active state: ${activeState} (${retryCount})`);
        setTimeout(async () => {
          resolve(await this.safeLoadProcess(account, processId, activeState, allowStates, retryCount++));
        }, RETRY_RATE)
      });
    }
  }

  generateId(account, chain, identifier) {
    if (account.id) {
      return;
    }

    account.id = chain.createProjectionId(identifier);
  }
}

module.exports = ILTHelper;

