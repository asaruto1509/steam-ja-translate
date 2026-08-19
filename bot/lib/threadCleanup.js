'use strict';

// /askや/detectiveのスレッド用状態(askThreadIds, detectiveThreads, historyStore)は
// スレッド作成時に追加されるだけで、これまで削除する経路が無かった。
// Botを長期間動かし続けるとアーカイブ済みスレッドの残骸がメモリに溜まり続けるため、
// スレッドがアーカイブされたタイミングでまとめて掃除する。
function cleanupArchivedThread(threadId, state) {
  state.askThreadIds.delete(threadId);
  state.detectiveThreads.delete(threadId);
  if (state.historyStore && state.historyStore.data) {
    delete state.historyStore.data[threadId];
  }
}

module.exports = { cleanupArchivedThread: cleanupArchivedThread };
