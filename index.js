const delay = require('delay');
const ILTHelper = require('./lib/ILTHelper');
const licenseId = '123456';
const transportId = 'SH1234';
let node1 = 'http://localhost:3000';
node1 = 'http://lto-fullnode-staging.eu-west-1.elasticbeanstalk.com';

const main = async () => {
  const iltHelper = new ILTHelper(node1);
  const systemkey = await iltHelper.loadSystemKey();
  const nodeAddress = await iltHelper.loadNodeAddress();

  const iltAccount = iltHelper.createAccount('seed for the ministry of ilt');
  const licenseHolderAccount = iltHelper.createAccount('seed for the license holder');

  const wasteCompanyAccount = iltHelper.createAccount('seed for the waste company');
  const enforcerAccount = iltHelper.createAccount('seed for the enforcer');

  const transportAccount = iltHelper.createAccount('seed for the transport company');
  const storageAccount = iltHelper.createAccount('seed for the storage company');

  const iltPublicSignKey = iltAccount.getPublicSignKey();

  // Removing old chains and flows for test purposes

  console.log('Delete previous chain and processes');
  await iltHelper.deleteMainProcess(iltAccount, licenseId);
  await iltHelper.deleteTransportProcess(iltAccount, licenseId, transportId);
  await iltHelper.deleteLicenseChain(iltAccount, licenseId);

  //// ILT generates the license (chain)
  let chain = await iltHelper.createEventChain(iltAccount, licenseId);
  const processId = chain.createProjectionId('main');

  // Trigger the first action of the licenseScenario to instantiate the process
  const licenseInfo = {
    reference: licenseId,
    shipments: 3,
    quantity: 20,
    material: 'general garbage',
    period: {
      from: '2018-01-01',
      to: '2018-12-31'
    },
    license_holder: {
      name: 'Waste BV'
    }
  };
  chain = await iltHelper.initializeLicenseProcess(chain, processId, iltAccount, licenseHolderAccount, licenseInfo);
  try {
    let res  = await iltHelper.sendChain(iltAccount, chain);
    console.log(res.data);
  } catch (e) {
    console.log(e.response);
  }

  await delay(3000);

  // Wait until the license process is in the live state
  try {
    const licenseProcess = await iltHelper.safeLoadProcess(licenseHolderAccount, processId, 'live', ['initial']);
  } catch (e) {
    console.log(e);
  }

  chain = await iltHelper.loadChain(licenseHolderAccount, chain.id);
  const transportProcessId = chain.createProjectionId(transportId);

  const transportInfo = {
    reference: transportId,
    material: 'general garbage',
    package_type: 'plastic',
    shipment_date: '2018-06-01',
    license_process: {
      id: processId
    },
    quantity: 6.2,
    transport: {
      name: 'Truck BV'
    },
    recipient: {
      name: 'Storage BV'
    },
    processor: {
      name: 'Storage BV'
    }
  };
  chain = await iltHelper.initializeTransportProcess(chain, iltAccount, licenseHolderAccount, transportAccount, storageAccount, storageAccount, transportInfo, transportProcessId);
  try {
    let res  = await iltHelper.sendChain(iltAccount, chain);
    // console.log(res.data);
  } catch (e) {
    console.log(e.response);
  }

  await delay(5000);
  // Wait until the transport process is in the ready state
  const transportProcess = await iltHelper.safeLoadProcess(licenseHolderAccount, transportProcessId,'ready', ['initial', 'approval_required']);

  chain = await iltHelper.loadChain(transportAccount, chain.id);

  chain = await iltHelper.startTransport(chain, transportAccount, transportProcessId);
  try {
    let res  = await iltHelper.sendChain(transportAccount, chain);
  } catch (e) {
    console.log(e.response);
  }

  await delay(1000);
  // Wait until the transport process is in the ready state
  await iltHelper.safeLoadProcess(licenseHolderAccount, transportProcessId,'transporting', ['ready']);

  chain = await iltHelper.loadChain(storageAccount, chain.id);

  const transportReceiveData = {
    quantity: 6.0
  };
  chain = await iltHelper.receiveTransport(chain, storageAccount, transportProcessId, transportReceiveData);
  try {
    let res  = await iltHelper.sendChain(storageAccount, chain);
  } catch (e) {
    console.log(e.response);
  }

  await delay(1000);
  // Wait until the transport process is in the ready state
  await iltHelper.safeLoadProcess(licenseHolderAccount, transportProcessId,'received', ['transporting']);
  chain = await iltHelper.loadChain(storageAccount, chain.id);

  chain = await iltHelper.processTransport(chain, storageAccount, transportProcessId);
  try {
    let res  = await iltHelper.sendChain(storageAccount, chain);
  } catch (e) {
    console.log(e.response);
  }

  await delay(3000);
  // Wait until the transport process is in the ready state
  const res = await iltHelper.safeLoadProcess(licenseHolderAccount, transportProcessId,':success', ['processed', 'received']);
  console.log(res);
};

main();
