// consolidation-helper.js
// Добавляет кнопку "Копировать в буфер" на страницу сборки (consolidation)
// Инжектит кнопку в панель действий с выбранными грузоместами.
// Реакт-safe: переинжект кнопки при каждом ре-рендере панели.
(function () {
    'use strict';

    const BTN_ID = 'mh-copy-btn';
    const MARKER_ATTR = 'data-mh-copy';
    let lastPanelHash = '';

    function createCopyButton() {
        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.setAttribute(MARKER_ATTR, '1');
        btn.type = 'button';

        // Копируем стили существующей кнопки "Убрать из тары"
        btn.className = [
            'mez-flex', 'mez-flex-row', 'mez-gap-[10px]',
            'mez-items-center', 'mez-justify-center', 'mez-relative',
            'mez-whitespace-pre', 'mez-text-ellipsis', 'mez-overflow-hidden',
            'mez-py-[14px]', 'mez-rounded-sm', 'active:mez-scale-97',
            'mez-transition', 'mez-ease-out', 'mez-duration-200',
            'mez-px-[16px]', 'mez-font-ys-text',
            'mez-text-m-button', 'mez-leading-m-button',
            'sm:mez-text-button', 'sm:mez-leading-button',
            'mez-font-[500]', 'mez-lining-nums', 'mez-proportional-nums'
        ].join(' ');

        // Наш кастомный фон — зелёный акцент
        btn.style.background = '#34c759';
        btn.style.color = '#fff';
        btn.textContent = 'Копировать в буфер';

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            handleCopy(btn);
        });

        return btn;
    }

    function getSelectedCargoIds() {
        // Ищем все чекбоксы в таблице, которые отмечены
        const checkboxes = document.querySelectorAll(
            'input[type="checkbox"]:checked'
        );
        const ids = [];

        checkboxes.forEach((cb) => {
            // Поднимаемся до строки таблицы
            const row = cb.closest('tr');
            if (!row) return;

            // Грузоместо — второй столбец (индекс 1)
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;

            const cargoCell = cells[1];
            // Первый span в ячейке — это ID грузоместа
            const firstSpan = cargoCell.querySelector('span');
            if (firstSpan) {
                const text = firstSpan.textContent.trim();
                if (text) ids.push(text);
            }
        });

        return ids;
    }

    async function handleCopy(btn) {
        const ids = getSelectedCargoIds();

        if (!ids.length) {
            showFeedback(btn, 'Ничего не выбрано', '#ff3b30');
            return;
        }

        const text = ids.join('\n');

        try {
            await navigator.clipboard.writeText(text);
            showFeedback(btn, 'Скопировано!', '#34c759');
        } catch {
            // Fallback для страниц без clipboard API
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showFeedback(btn, 'Скопировано!', '#34c759');
        }
    }

    function showFeedback(btn, text, color) {
        const original = btn.textContent;
        btn.textContent = text;
        btn.style.background = color;
        setTimeout(() => {
            btn.textContent = original;
            btn.style.background = '#34c759';
        }, 1200);
    }

    function injectButton() {
        // Ищем панель действий с "Выбрано" текстом
        // Селектор: контейнер с sticky bottom, внутри div с тенями
        const panels = document.querySelectorAll(
            '.mez-sticky.mez-bottom-0'
        );

        for (const panel of panels) {
            // Проверяем, содержит ли панель кнопку "Убрать из тары"
            const innerPanel = panel.querySelector(
                '.mez-shadow-3'
            );
            if (!innerPanel) continue;

            // Проверяем хеш, чтобы не переинжектить без изменений
            const hash = innerPanel.innerHTML.length + '|' + innerPanel.childElementCount;
            if (hash === lastPanelHash) continue;
            lastPanelHash = hash;

            // Ищем группу кнопок
            const btnGroup = innerPanel.querySelector(
                '.mez-inline-flex.mez-flex-row.mez-gap-\\[16px\\]'
            );

            if (!btnGroup) continue;

            // Проверяем, есть ли уже наша кнопка
            if (document.getElementById(BTN_ID)) continue;

            // Инжектим кнопку в группу
            const copyBtn = createCopyButton();
            btnGroup.insertBefore(copyBtn, btnGroup.firstChild);
        }
    }

    function init() {
        // MutationObserver для отслеживания появления/обновления панели
        const observer = new MutationObserver(() => {
            injectButton();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Начальная проверка
        setTimeout(injectButton, 500);
        setTimeout(injectButton, 1500);
        setTimeout(injectButton, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
