import { demandWarehouseSlot } from "./warehouse-logistics.js";
import "./warehouse-orders.css";
export function installWarehouseOrders({
  engine,
  getState,
  products,
  onView,
  onRefresh,
  onPrepare,
}) {
  const host =
    document.querySelector("#panel-operation") ??
    document.querySelector(".inspector-panel");
  const section = document.createElement("section");
  section.className = "panel-section warehouse-orders";
  section.setAttribute("aria-label", "Estoque e pedidos");
  section.innerHTML = `<div class="warehouse-title"><h2>Estoque e pedidos</h2><button type="button" data-warehouse-view>Estoque da linha</button></div><p>As caixas ficam guardadas até a expedição de um pedido conferido.</p><div class="warehouse-counts"><div><strong data-count="available">0</strong><span>Disponíveis</span></div><div><strong data-count="reserved">0</strong><span>Reservadas</span></div><div><strong data-count="picking">0</strong><span>Na separação</span></div></div><p class="warehouse-capacity" data-capacity></p><label class="warehouse-order-size">Caixas por pedido<select data-order-size aria-label="Caixas por pedido"><option value="0">Aleatório · até 3</option><option value="1">1 caixa</option><option value="2">2 caixas</option><option value="3">3 caixas</option></select></label><div class="warehouse-actions"><button type="button" class="primary" data-generate-order>Gerar pedido</button><button type="button" data-prepare-production>Preparar produção</button></div><p class="muted">Pedidos de prática: até 3 caixas, sempre do estoque disponível.</p><p class="warehouse-notice" role="status" aria-live="polite" data-order-notice></p><div class="warehouse-transfer" hidden><span data-transfer-state></span><progress max="1" value="0" aria-label="Progresso da movimentação do pedido"></progress></div><div data-orders-list></div><details><summary>Endereços ocupados</summary><ul class="warehouse-stock" data-stock-list></ul></details>`;
  const picker = host.querySelector(".product-picker");
  if (picker) picker.after(section);
  else host.prepend(section);
  const productName = (id) => products.find((p) => p.id === id)?.name ?? id;
  const states = {
    reserved: "Reservado",
    picking: "Separação em andamento",
    picked: "Aguardando conferência",
    checked: "Conferido",
    shipping: "Carregamento em andamento",
    shipped: "Expedido",
  };
  let orderKey = "",
    stockKey = "";
  function notify(message, error = false) {
    const p = section.querySelector("[data-order-notice]");
    p.textContent = message;
    p.dataset.error = String(error);
  }
  function act(result, move = false) {
    if (!result?.ok) {
      notify(
        result?.message ?? "Ação indisponível. Confira o estado da operação.",
        true,
      );
      return false;
    }
    notify(
      move
        ? "Movimento autorizado. Use Pausar para interromper com segurança."
        : "Pedido atualizado.",
    );
    if (move) {
      onView();
      engine.start();
    }
    onRefresh();
    return true;
  }
  section.querySelector("[data-warehouse-view]").onclick = () => onView();
  section.querySelector("[data-prepare-production]").onclick = () =>
    onPrepare?.();
  section.querySelector("[data-generate-order]").onclick = () => {
    const size = Number(section.querySelector("[data-order-size]").value);
    let options = {};
    if (size) {
      const stock = getState().inventory.boxes.filter(
        (b) => b.status === "available",
      );
      const eligible = products.filter(
        (p) => stock.filter((b) => b.product === p.id).length >= size,
      );
      if (!eligible.length) {
        notify(`Não há ${size} caixas disponíveis do mesmo produto.`, true);
        return;
      }
      options = {
        quantity: size,
        product: eligible[Math.floor(Math.random() * eligible.length)].id,
      };
    }
    const r = engine.generateOrder(options);
    if (act(r)) {
      notify(
        `${r.order.customer}: ${r.order.quantity} caixa(s) de ${productName(r.order.product)} reservadas.`,
      );
      onView();
    }
  };
  function render(state = getState()) {
    const inv = state.inventory;
    if (!inv) return;
    const c = inv.counts;
    section.querySelector('[data-count="available"]').textContent = c.available;
    section.querySelector('[data-count="reserved"]').textContent =
      c.reserved + c.picking;
    section.querySelector('[data-count="picking"]').textContent =
      c.picked + c.checked;
    section.querySelector("[data-capacity]").textContent =
      `${c.occupied} / ${inv.capacity} endereços ocupados · ${c.free} livres${c.shipping ? ` · ${c.shipping} em expedição` : ""}`;
    section.querySelector("[data-generate-order]").disabled = c.available === 0;
    if (
      c.available > 0 &&
      section
        .querySelector("[data-order-notice]")
        .textContent.startsWith("Prepare um lote")
    )
      notify("Caixas guardadas. Gere um pedido quando quiser.");
    if (
      !inv.boxes.length &&
      !section.querySelector("[data-order-notice]").textContent
    )
      notify(
        "Prepare um lote, inicie a produção e armazene as caixas para gerar um pedido.",
      );
    const transfer = section.querySelector(".warehouse-transfer");
    transfer.hidden = !state.fulfillment;
    if (state.fulfillment) {
      section.querySelector("[data-transfer-state]").textContent =
        `${state.fulfillment.action === "pick" ? "Separando" : "Expedindo"} caixa ${state.fulfillment.index + 1} de ${state.fulfillment.total}`;
      transfer.querySelector("progress").value = state.fulfillment.progress;
    }
    const key = JSON.stringify(inv.orders);
    if (key !== orderKey) {
      orderKey = key;
      const list = section.querySelector("[data-orders-list]");
      list.replaceChildren();
      for (const order of [...inv.orders].reverse().slice(0, 10)) {
        const card = document.createElement("article");
        card.className = "warehouse-order";
        card.dataset.orderId = order.id;
        const heading = document.createElement("strong");
        heading.textContent = `${order.id} · ${order.customer}`;
        card.append(heading);
        const detail = document.createElement("p");
        detail.textContent = `${order.quantity} caixa(s) · ${productName(order.product)}`;
        card.append(detail);
        const status = document.createElement("span");
        status.className = "warehouse-order-status";
        status.textContent = states[order.status] ?? order.status;
        card.append(status);
        const addresses = document.createElement("p");
        addresses.className = "muted";
        addresses.textContent = order.boxIds
          .map((id) => inv.boxes.find((b) => b.id === id)?.address)
          .filter(Boolean)
          .map((address) => demandWarehouseSlot(address).label)
          .join(" · ");
        card.append(addresses);
        if (!["shipped", "shipping", "picking"].includes(order.status)) {
          const form = document.createElement("div");
          form.className = "warehouse-check";
          const labelProduct = document.createElement("label");
          labelProduct.textContent = "Produto separado";
          const select = document.createElement("select");
          select.setAttribute("aria-label", `Produto separado de ${order.id}`);
          select.name = `product-${order.id}`;
          for (const p of products) {
            const o = document.createElement("option");
            o.value = p.id;
            o.textContent = p.name;
            select.append(o);
          }
          select.value = order.product;
          labelProduct.append(select);
          form.append(labelProduct);
          const labelQuantity = document.createElement("label");
          labelQuantity.textContent = "Caixas separadas";
          const input = document.createElement("input");
          input.type = "number";
          input.min = "1";
          input.max = "3";
          input.value = order.quantity;
          input.name = `quantity-${order.id}`;
          input.setAttribute("aria-label", `Caixas separadas de ${order.id}`);
          labelQuantity.append(input);
          form.append(labelQuantity);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "primary";
          button.textContent =
            order.status === "reserved"
              ? "Separar caixas"
              : order.status === "picked"
                ? "Conferir pedido"
                : "Expedir pedido";
          button.onclick = () => {
            const product = select.value,
              quantity = Number(input.value);
            if (product !== order.product || quantity !== order.quantity) {
              notify(
                "Produto ou quantidade não correspondem ao pedido. Nenhuma caixa foi movimentada.",
                true,
              );
              return;
            }
            if (order.status === "reserved")
              act(engine.pickOrder(order.id, order.boxIds), true);
            else if (order.status === "picked")
              act(
                engine.checkOrder(order.id, {
                  product,
                  quantity,
                  boxIds: order.boxIds,
                }),
              );
            else if (order.status === "checked")
              act(engine.dispatchOrder(order.id), true);
          };
          form.append(button);
          card.append(form);
        }
        list.append(card);
      }
    }
    const stock = inv.boxes.filter((b) => b.status !== "shipped"),
      sk = JSON.stringify(stock.map((b) => [b.id, b.address, b.status]));
    if (sk !== stockKey) {
      stockKey = sk;
      const ul = section.querySelector("[data-stock-list]");
      ul.replaceChildren();
      for (const b of stock) {
        const li = document.createElement("li");
        li.textContent = `${demandWarehouseSlot(b.address).label} · ${productName(b.product)} · ${states[b.status] ?? "Disponível"}`;
        ul.append(li);
      }
    }
  }
  render();
  return {
    render,
    notify,
    close() {
      section.remove();
    },
  };
}
