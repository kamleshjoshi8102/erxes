import {
  Brands,
  Conversations,
  Customers,
  EngageMessages,
  Integrations
} from '../db/models';
import Messages from '../db/models/ConversationMessages';
import { IBrowserInfo } from '../db/models/Customers';
import { KIND_CHOICES } from '../db/models/definitions/constants';
import { getVisitorLog } from './logUtils';

export const getOrCreateEngageMessage = async (
  browserInfo: IBrowserInfo,
  visitorId?: string,
  customerId?: string
) => {
  let integrationId;

  let customer;

  if (customerId) {
    customer = await Customers.getCustomer(customerId);
    integrationId = customer.integrationId;
  }

  let visitor;

  if (visitorId) {
    visitor = await getVisitorLog(visitorId);
    integrationId = visitor.integrationId;
  }

  // Preventing from displaying non messenger integrations like form's messages
  // as last unread message
  const integration = await Integrations.findOne({
    _id: integrationId,
    kind: KIND_CHOICES.MESSENGER
  });

  if (!integration) {
    throw new Error('Integration not found');
  }

  const brand = await Brands.getBrand(integration.brandId || '');

  // try to create engage chat auto messages
  await EngageMessages.createVisitorOrCustomerMessages({
    brand,
    integration,
    customer,
    visitor,
    browserInfo
  });

  // find conversations
  const query = customerId
    ? { integrationId, customerId }
    : { integrationId, visitorId };

  const convs = await Conversations.find(query);

  return Messages.findOne(Conversations.widgetsUnreadMessagesQuery(convs));
};

export const createVisitorFromVisitorLog = async (visitorId: string) => {
  const visitor = await getVisitorLog(visitorId);

  delete visitor.visitorId;
  delete visitor._id;
  const doc = { state: 'visitor', ...visitor };
  const customer = await Customers.createCustomer(doc);

  await Messages.updateVisitorEngageMessages(visitorId, customer._id);
  await Conversations.updateMany(
    {
      visitorId
    },
    { $set: { customerId: customer._id, visitorId: '' } },
    { multi: true }
  );

  return customer;
};
