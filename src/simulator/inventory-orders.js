import { safeData } from './state-validation.js';

export const INVENTORY_VERSION = 1;
export const WAREHOUSE_CAPACITY = 24;
export const warehouseAddresses = (capacity = WAREHOUSE_CAPACITY) =>
  Array.from({ length: capacity }, (_, i) => `PA-${String(i + 1).padStart(2, '0')}`);
const clone = value => structuredClone(value);
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/.test(value);
const integer = (value, min = 1, max = 2000) => Number.isSafeInteger(value) && value >= min && value <= max;
const statuses = ['available', 'reserved', 'picking', 'picked', 'checked', 'shipping', 'shipped'];
const customers = ['Mercado Horizonte', 'Casa Aurora', 'Comercial Ipê', 'Loja Primavera', 'Distribuidora Central'];
const failure = (code, message) => ({ ok: false, code, message });

// Quantities requested in orders are whole boxes. A box's quantity is its content.
export function createWarehouseInventory({ environment, accountKey = 'progress-owner', capacity = WAREHOUSE_CAPACITY, slots = warehouseAddresses(capacity), rng = Math.random, products } = {}) {
  if (!identifier(environment) || !identifier(accountKey) || !integer(capacity, 1, 200) || slots.length !== capacity || slots.some(s => !identifier(s)) || new Set(slots).size !== capacity)
    throw new Error('Configuração de armazém inválida.');
  slots = [...slots];
  let boxes = [], orders = [], lotSequence = 1, orderSequence = 0;
  const lotId = () => `L${String(lotSequence).padStart(6, '0')}`;
  const productValid = product => identifier(product) && (!products || products.includes(product));
  const result = order => ({ ok: true, ...(order ? { order: clone(order) } : {}) });
  const findOrder = id => orders.find(order => order.id === id);
  const orderBoxes = order => order.boxIds.map(id => boxes.find(box => box.id === id));
  const freeAddress = () => slots.find(address => !boxes.some(box => box.status !== 'shipped' && box.address === address));
  function exactIds(order, ids) {
    return Array.isArray(ids) && ids.length === order.boxIds.length && new Set(ids).size === ids.length && ids.every(id => order.boxIds.includes(id));
  }
  function validateState(value) {
    if (!safeData(value) || value.version !== INVENTORY_VERSION || value.environment !== environment || value.accountKey !== accountKey || value.capacity !== capacity || JSON.stringify(value.slots) !== JSON.stringify(slots) || !integer(value.lotSequence, 1, 1e8) || !integer(value.orderSequence, 0, 1e8) || !Array.isArray(value.boxes) || !Array.isArray(value.orders) || value.boxes.length > 2000 || value.orders.length > 2000) return false;
    const ids = new Set(), addresses = new Set(), linked = new Set();
    for (const box of value.boxes) {
      if (!identifier(box.id) || ids.has(box.id) || !identifier(box.sourceId) || !/^L\d{6,9}$/.test(box.lotId) || Number(box.lotId.slice(1)) > value.lotSequence || box.id !== `${box.lotId}:${box.sourceId}` || !productValid(box.product) || !integer(box.quantity, 1, 1000) || !statuses.includes(box.status) || !box.unit || box.unit.id !== box.sourceId || box.unit.product !== box.product || (box.orderId !== null && !identifier(box.orderId))) return false;
      ids.add(box.id);
      if (box.status === 'shipped') { if (box.address !== null) return false; }
      else { if (!slots.includes(box.address) || addresses.has(box.address)) return false; addresses.add(box.address); }
      if ((box.status === 'available') !== (box.orderId === null)) return false;
    }
    const orderIds = new Set();
    for (const order of value.orders) {
      if (!/^PED-\d{6,9}$/.test(order.id) || Number(order.id.slice(4)) > value.orderSequence || orderIds.has(order.id) || !productValid(order.product) || !integer(order.quantity, 1, capacity) || !integer(order.unitQuantity, 1, capacity * 1000) || typeof order.customer !== 'string' || !order.customer.length || order.customer.length > 120 || !['reserved', 'picking', 'picked', 'checked', 'shipping', 'shipped'].includes(order.status) || !Array.isArray(order.boxIds) || order.boxIds.length !== order.quantity || new Set(order.boxIds).size !== order.quantity) return false;
      orderIds.add(order.id);
      let contents = 0;
      for (const id of order.boxIds) {
        const box = value.boxes.find(b => b.id === id);
        const allowed=order.status==='shipping'?['shipping','shipped']:order.status==='picking'?['picking','picked']:[order.status];
        if (!box || linked.has(id) || box.orderId !== order.id || box.product !== order.product || !allowed.includes(box.status)) return false;
        linked.add(id); contents += box.quantity;
      }
      if (contents !== order.unitQuantity) return false;
      if (order.status === 'shipping' && order.boxIds.every(id => value.boxes.find(b => b.id === id).status === 'shipped')) return false;
      if (order.status === 'picking' && order.boxIds.every(id => value.boxes.find(b => b.id === id).status === 'picked')) return false;
    }
    return value.boxes.every(box => box.status === 'available' || linked.has(box.id));
  }
  const api = {
    getFreeAddress:freeAddress,
    getBox(id){const box=boxes.find(box=>box.id===id);return box?clone(box):null;},
    beginLot() { lotSequence++; return lotId(); },
    canReceiveBox() { return !!freeAddress(); },
    receiveBox({ id, product, quantity = 1, unit, address, lotId: lot = lotId() } = {}) {
      if (!identifier(id) || !productValid(product) || !integer(quantity, 1, 1000) || !/^L\d{6,9}$/.test(lot) || Number(lot.slice(1)) > lotSequence || !safeData(unit) || !unit || unit.id !== id || unit.product !== product)
        return failure('INVALID_BOX', 'A caixa precisa manter identificação, produto e conteúdo válidos.');
      const inventoryId = `${lot}:${id}`, previous = boxes.find(box => box.id === inventoryId);
      if(!identifier(inventoryId))return failure('INVALID_BOX','A identificação da caixa é longa demais.');
      if (previous) return previous.product === product && previous.quantity === quantity && JSON.stringify(previous.unit) === JSON.stringify(unit) ? { ...result(), box: clone(previous), alreadyReceived: true } : failure('DUPLICATE_BOX', 'Esta identificação já pertence a outra caixa.');
      const target = address ?? freeAddress();
      if (!target) return failure('WAREHOUSE_FULL', 'Armazém cheio. Atenda um pedido para liberar um endereço.');
      if (!slots.includes(target) || boxes.some(box => box.status !== 'shipped' && box.address === target)) return failure('ADDRESS_UNAVAILABLE', 'O endereço está ocupado ou não existe.');
      const box = { id: inventoryId, sourceId: id, lotId: lot, product, quantity, unit: clone(unit), address: target, status: 'available', orderId: null };
      boxes.push(box); return { ...result(), box: clone(box) };
    },
    generateOrder(options = {}) {
      const available = boxes.filter(box => box.status === 'available');
      if (!available.length) return failure('NO_AVAILABLE_STOCK', 'Produza e armazene caixas disponíveis antes de gerar um pedido.');
      const random = options.rng ?? rng;
      const choose = length => { const value = random(); if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Sorteio inválido.'); return Math.floor(value * length); };
      let product, quantity, customer;
      try {
        const productList = [...new Set(available.map(box => box.product))];
        product = options.product ?? productList[choose(productList.length)];
        const count = available.filter(box => box.product === product).length;
        if (!count) return failure('INSUFFICIENT_STOCK', 'Não há caixas disponíveis deste produto.');
        const maxBoxes=options.maxBoxes===undefined?count:Math.min(count,options.maxBoxes);
        if(!integer(maxBoxes,1,capacity))return failure('INVALID_QUANTITY','Limite de pedido inválido.');
        quantity = options.quantity ?? 1 + choose(maxBoxes);
        if (!integer(quantity, 1, maxBoxes)) return failure('INSUFFICIENT_STOCK', 'A quantidade pedida supera o estoque disponível ou a área de separação.');
        customer = customers[choose(customers.length)];
      } catch { return failure('INVALID_RANDOM', 'Não foi possível gerar o pedido.'); }
      const reserved = available.filter(box => box.product === product).slice(0, quantity);
      const order = { id: `PED-${String(++orderSequence).padStart(6, '0')}`, customer, product, quantity, unitQuantity: reserved.reduce((sum, box) => sum + box.quantity, 0), boxIds: reserved.map(box => box.id), status: 'reserved' };
      orders.push(order); reserved.forEach(box => { box.status = 'reserved'; box.orderId = order.id; });
      return result(order);
    },
    reserveOrder(id) { const order = findOrder(id); return !order ? failure('ORDER_NOT_FOUND', 'Pedido não encontrado.') : order.status !== 'reserved' ? failure('INVALID_ORDER_STATUS', 'O pedido já avançou para a separação.') : result(order); },
    pickOrder(id, boxIds) {
      const order = findOrder(id);
      if (!order) return failure('ORDER_NOT_FOUND', 'Pedido não encontrado.');
      if (order.status !== 'reserved') return failure('NOT_RESERVED', 'Reserve o pedido antes de separar as caixas.');
      if (!exactIds(order, boxIds)) return failure('WRONG_BOXES', 'Separe exatamente as caixas reservadas para este pedido.');
      order.status = 'picking'; orderBoxes(order).forEach(box => box.status = 'picking'); return { ...result(order), boxes:clone(orderBoxes(order)) };
    },
    completePickBox(orderId,boxId) {
      const order=findOrder(orderId),box=boxes.find(b=>b.id===boxId);
      if(!order||order.status!=='picking'||!box||box.orderId!==orderId||box.status!=='picking')return failure('UNAUTHORIZED_PICK','A caixa não tem uma separação autorizada em andamento.');
      box.status='picked';if(orderBoxes(order).every(b=>b.status==='picked'))order.status='picked';return {...result(order),box:clone(box)};
    },
    checkOrder(id, { product, quantity, boxIds } = {}) {
      const order = findOrder(id);
      if (!order) return failure('ORDER_NOT_FOUND', 'Pedido não encontrado.');
      if (order.status !== 'picked') return failure('NOT_PICKED', 'Separe as caixas antes de conferir o pedido.');
      if (product !== order.product || quantity !== order.quantity || (boxIds !== undefined && !exactIds(order, boxIds))) return failure('CHECK_MISMATCH', 'Produto, quantidade ou caixas não correspondem ao pedido.');
      order.status = 'checked'; orderBoxes(order).forEach(box => box.status = 'checked'); return result(order);
    },
    dispatchOrder(id) {
      const order = findOrder(id);
      if (!order) return failure('ORDER_NOT_FOUND', 'Pedido não encontrado.');
      if (order.status !== 'checked') return failure('NOT_CHECKED', 'Confira o pedido antes de autorizar a expedição.');
      order.status = 'shipping'; orderBoxes(order).forEach(box => box.status = 'shipping'); return { ...result(order), boxes: clone(orderBoxes(order)) };
    },
    completeShipmentBox(orderId, boxId) {
      const order = findOrder(orderId), box = boxes.find(b => b.id === boxId);
      if (!order || order.status !== 'shipping' || !box || box.orderId !== orderId || box.status !== 'shipping') return failure('UNAUTHORIZED_SHIPMENT', 'A caixa não tem uma expedição autorizada em andamento.');
      box.status = 'shipped'; box.address = null;
      if (orderBoxes(order).every(b => b.status === 'shipped')) order.status = 'shipped';
      return { ...result(order), box: clone(box) };
    },
    exportState() { return clone({ version: INVENTORY_VERSION, environment, accountKey, capacity, slots, lotSequence, orderSequence, boxes, orders }); },
    importState(value) { if (!validateState(value)) return false; const state = clone(value); ({ boxes, orders, lotSequence, orderSequence } = state); return true; },
    get snapshot() {
      const counts = Object.fromEntries(statuses.map(status => [status, boxes.filter(box => box.status === status).length]));
      counts.occupied = boxes.length - counts.shipped; counts.free = capacity - counts.occupied;
      return clone({ environment, lotId: lotId(), capacity, slots, boxes, orders, counts });
    },
  };
  return api;
}
