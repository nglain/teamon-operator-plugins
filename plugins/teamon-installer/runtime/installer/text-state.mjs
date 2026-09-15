export function renderState(state) {
  const titles={ready:'Готов к установке',running:'Установка выполняется',completed:'Operator установлен',failed:'Установка не подтверждена'};
  const rows=state.stages.map((stage,index)=>{
    const marker=index<state.completed?'x':index===state.active&&state.status==='failed'?'!':index===state.active&&state.status==='running'?'>':' ';
    return `| [${marker}] ${stage.name}`;
  });
  return ['+-- TeamON Operator: установка --+',`| ${titles[state.status]||'Состояние неизвестно'}`,...rows,
    ...(state.version?[`| Версия: ${state.version}`]:[]),
    ...(state.error?['| Ошибка: установка не подтверждена; повтор не запущен.']:[]),
    '+--------------------------------+',
    state.status==='completed'?'Следующий шаг — подключение TeamON Operator по установочному файлу: подготовить черновик, отправку подтверждает человек. Вход и открытие пульта ещё не проверены.':
    state.status==='failed'?'Проверьте structuredContent.error. Не повторяйте установку автоматически.':
    state.status==='running'?'Следующая проверка — installer_status того же runId.':'Запуск — только по запросу пользователя через installer_start с этим runId.'
  ].join('\n');
}
