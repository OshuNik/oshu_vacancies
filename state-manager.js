// state-manager.js — управление состоянием приложения

(function () {
  'use strict';

  const CONST = window.APP_CONSTANTS || {};

  class StateManager {
    constructor() {
      this.state = {
        query: '',
        activeKey: 'main',
        main: { offset: 0, total: 0, busy: false, loadedOnce: false, loadedForQuery: '' },
        maybe: { offset: 0, total: 0, busy: false, loadedOnce: false, loadedForQuery: '' },
        other: { offset: 0, total: 0, busy: false, loadedOnce: false, loadedForQuery: '' }
      };
      
      this.currentController = null;
      this.listeners = new Map();
    }

    // Получить текущее состояние
    getState() {
      return { ...this.state };
    }

    // Получить состояние конкретной категории
    getCategoryState(key) {
      return { ...this.state[key] };
    }

    // Обновить состояние категории
    updateCategoryState(key, updates) {
      if (this.state[key]) {
        this.state[key] = { ...this.state[key], ...updates };
        this.notifyListeners('categoryStateChanged', { key, state: this.state[key] });
      }
    }

    // Обновить активную категорию
    setActiveCategory(key) {
      if (this.state.activeKey !== key) {
        this.state.activeKey = key;
        this.notifyListeners('activeCategoryChanged', key);
      }
    }

    // Обновить поисковый запрос
    setQuery(query) {
      const trimmedQuery = query.trim();
      if (this.state.query !== trimmedQuery) {
        this.state.query = trimmedQuery;
        this.notifyListeners('queryChanged', trimmedQuery);
      }
    }

    // Сбросить состояние категории
    resetCategoryState(key) {
      if (this.state[key]) {
        this.state[key] = { offset: 0, total: 0, busy: false, loadedOnce: false, loadedForQuery: '' };
        this.notifyListeners('categoryStateReset', key);
      }
    }

    // Сбросить все состояния
    resetAllStates() {
      ['main', 'maybe', 'other'].forEach(key => {
        this.resetCategoryState(key);
      });
    }

    // Проверить, загружена ли категория для текущего запроса
    isCategoryLoadedForQuery(key) {
      const categoryState = this.state[key];
      return categoryState.loadedOnce && categoryState.loadedForQuery === this.state.query;
    }

    // Проверить, занята ли категория
    isCategoryBusy(key) {
      return this.state[key]?.busy || false;
    }

    // Установить занятость категории
    setCategoryBusy(key, busy) {
      this.updateCategoryState(key, { busy });
    }

    // Обновить счетчики
    updateCounts(counts) {
      Object.keys(counts).forEach(key => {
        if (this.state[key]) {
          this.updateCategoryState(key, { total: counts[key] });
        }
      });
      this.notifyListeners('countsUpdated', counts);
    }

    // Управление AbortController
    getCurrentController() {
      return this.currentController;
    }

    setCurrentController(controller) {
      this.currentController = controller;
    }

    abortCurrentRequest() {
      if (this.currentController && !this.currentController.signal.aborted) {
        try {
          this.currentController.abort();
        } catch (error) {
          console.warn('Ошибка отмены запроса:', error);
        }
      }
      this.currentController = new AbortController();
      return this.currentController;
    }

    // Система подписок на изменения состояния
    subscribe(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event).add(callback);
      
      // Возвращаем функцию для отписки
      return () => {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
          callbacks.delete(callback);
        }
      };
    }

    // Уведомить подписчиков
    notifyListeners(event, data) {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Ошибка в обработчике события ${event}:`, error);
          }
        });
      }
    }

    // Получить статистику состояния
    getStats() {
      const stats = {
        totalVacancies: 0,
        loadedVacancies: 0,
        busyCategories: 0,
        activeCategory: this.state.activeKey
      };

      ['main', 'maybe', 'other'].forEach(key => {
        const categoryState = this.state[key];
        stats.totalVacancies += categoryState.total || 0;
        if (categoryState.loadedOnce) {
          stats.loadedVacancies++;
        }
        if (categoryState.busy) {
          stats.busyCategories++;
        }
      });

      return stats;
    }

    // Очистить все подписки
    destroy() {
      this.listeners.clear();
      this.abortCurrentRequest();
    }
  }

  // Создаем глобальный экземпляр менеджера состояния
  window.stateManager = new StateManager();

})();
